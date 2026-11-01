import { describe, expect, it } from 'vitest';
import type { AccessEventFields, UserActor } from '../types/auth.js';
import { TEST_BUSINESS_ID } from '../testing/fake-session.js';
import { FakeMailer } from '../testing/mailer.fake.js';
import { FakeUsersRepository, makeUser, OWNER_ID } from '../testing/users.repository.fake.js';
import { hashPassword } from '../utils/password.js';
import { AccountNotifier } from './account-notifier.service.js';
import { AccountSecurityService } from './account-security.service.js';
import { ProfileService } from './profile.service.js';
import { UsersService } from './users.service.js';

/**
 * Cada cambio de contraseña deja el registro de seguridad (quién, a quién y
 * cuándo) y avisa por correo a los roles con correo propio (HU-13).
 */

const ENCARGADO_ID = '22222222-2222-4222-8222-222222222222';
const CAJERO_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN: UserActor = { id: OWNER_ID, role: 'ADMIN', businessId: null };
const ENCARGADO: UserActor = { id: ENCARGADO_ID, role: 'ENCARGADO', businessId: TEST_BUSINESS_ID };
const PASSWORD = 'ClaveSegura123';

async function setup() {
  const repository = new FakeUsersRepository([
    makeUser({ passwordHash: await hashPassword(PASSWORD) }),
    makeUser({ id: ENCARGADO_ID, name: 'Elena', email: 'elena@correo.cr', role: 'ENCARGADO' }),
    makeUser({ id: CAJERO_ID, name: 'Carlos', email: 'caja@correo.cr', role: 'CAJERO' }),
  ]);
  const events: AccessEventFields[] = [];
  const mailer = new FakeMailer();
  const security = new AccountSecurityService(
    {
      record: (fields) => {
        events.push(fields);

        return Promise.resolve();
      },
    },
    new AccountNotifier(mailer),
  );

  return {
    events,
    mailer,
    users: new UsersService(repository, security),
    profile: new ProfileService(repository, security),
  };
}

describe('registro y aviso al cambiar una contraseña', () => {
  it('el Administrador restablece la de una Encargada: queda quién lo hizo y ella recibe un aviso', async () => {
    const { users, events, mailer } = await setup();

    await users.resetPassword(ENCARGADO_ID, ADMIN);

    expect(events).toEqual([
      {
        type: 'PASSWORD_RESET_BY_MANAGER',
        userId: ENCARGADO_ID,
        businessId: TEST_BUSINESS_ID,
        actorId: OWNER_ID,
      },
    ]);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({ to: 'elena@correo.cr' });
    expect(mailer.sent[0]?.text).toContain('contraseña temporal');
    // El correo nunca lleva la contraseña.
    expect(mailer.sent[0]?.text).not.toMatch(/Contraseña temporal: /);
  });

  it('la Encargada restablece la de un Cajero: queda el registro, pero no se le envía correo', async () => {
    const { users, events, mailer } = await setup();

    await users.resetPassword(CAJERO_ID, ENCARGADO);

    expect(events).toEqual([
      expect.objectContaining({
        type: 'PASSWORD_RESET_BY_MANAGER',
        userId: CAJERO_ID,
        actorId: ENCARGADO_ID,
      }),
    ]);
    expect(mailer.sent).toHaveLength(0);
  });

  it('cambiarla en «Mi perfil» deja el registro y avisa al correo de la cuenta', async () => {
    const { profile, events, mailer } = await setup();

    await profile.updateProfile(OWNER_ID, {
      newPassword: 'OtraClave456789',
      currentPassword: PASSWORD,
    });

    expect(events).toEqual([
      { type: 'PASSWORD_CHANGED', userId: OWNER_ID, businessId: null, actorId: null },
    ]);
    expect(mailer.sent[0]).toMatchObject({
      to: 'ana@correo.cr',
      subject: 'Su contraseña de MiniSuper cambió',
    });
  });

  it('cambiar solo el nombre no deja registro ni manda correo', async () => {
    const { profile, events, mailer } = await setup();

    await profile.updateProfile(OWNER_ID, { name: 'Ana María' });

    expect(events).toHaveLength(0);
    expect(mailer.sent).toHaveLength(0);
  });
});
