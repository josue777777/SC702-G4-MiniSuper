import type { Role } from '../auth/permissions.js';
import type { AccessEventsRepository } from '../repositories/access-events.repository.js';
import type { AccessEventType } from '../types/auth.js';
import type { AccountNotifier, PasswordChange } from './account-notifier.service.js';

/** La cuenta a la que le cambió la contraseña. */
export interface ChangedAccount {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  businessId: string | null;
}

/**
 * Lo que pasa SIEMPRE que cambia una contraseña (HU-13): queda en el registro de
 * seguridad y, si el rol tiene correo propio, la persona recibe un aviso.
 *
 * Los services de usuarios y de perfil la reciben como dependencia. Las rutas
 * reales le pasan `AccountSecurityService`; las pruebas que no la necesitan
 * usan `NO_ACCOUNT_SECURITY`.
 */
export interface AccountSecurity {
  passwordChanged(
    account: ChangedAccount,
    how: PasswordChange,
    actorId: string | null,
  ): Promise<void>;
}

const EVENT_OF: Record<PasswordChange, AccessEventType> = {
  recovered: 'PASSWORD_RECOVERED_BY_EMAIL',
  changed: 'PASSWORD_CHANGED',
  'reset-by-manager': 'PASSWORD_RESET_BY_MANAGER',
};

/**
 * Lo que pasa después de cambiar una contraseña: guarda el evento en el historial
 * de accesos y, si el rol recupera por correo, le avisa a la persona por correo.
 */
export class AccountSecurityService implements AccountSecurity {
  constructor(
    private readonly events: Pick<AccessEventsRepository, 'record'>,
    private readonly notifier: AccountNotifier,
  ) {}

  async passwordChanged(
    account: ChangedAccount,
    how: PasswordChange,
    actorId: string | null,
  ): Promise<void> {
    await this.events.record({
      type: EVENT_OF[how],
      userId: account.id,
      businessId: account.businessId,
      actorId,
    });
    this.notifier.passwordChanged(account, how);
  }
}

/** Para pruebas que no revisan el registro ni los avisos. */
export const NO_ACCOUNT_SECURITY: AccountSecurity = {
  passwordChanged: () => Promise.resolve(),
};
