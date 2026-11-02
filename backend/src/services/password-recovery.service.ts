import { recoversByEmail } from '../auth/permissions.js';
import type { PasswordResetRepository } from '../repositories/password-reset.repository.js';
import type { RecoverableAccount } from '../types/auth.js';
import { HttpError } from '../utils/http-error.js';
import type { LoginRateLimiter } from '../utils/login-rate-limiter.js';
import { hashPassword } from '../utils/password.js';
import {
  generateResetToken,
  hashResetToken,
  RESET_TOKEN_TTL_MINUTES,
} from '../utils/reset-token.js';
import type { AccountNotifier } from './account-notifier.service.js';

const INVALID_LINK = 'El enlace no es válido o ya venció. Solicite uno nuevo.';
const TOO_MANY = 'Demasiadas solicitudes. Intente de nuevo más tarde.';

export interface PasswordRecoveryOptions {
  /** Dirección del frontend, para armar el enlace del correo. */
  appUrl: string;
  /** Solicitudes por correo: nadie llena el buzón de otro pidiendo enlaces. */
  emailLimiter: LoginRateLimiter;
  /** Solicitudes por IP: nadie prueba miles de correos desde un mismo equipo. */
  ipLimiter: LoginRateLimiter;
  /** Reloj inyectable para probar el vencimiento. */
  now?: () => Date;
}

/**
 * Recuperación de contraseña por correo (HU-13). Solo para los roles que la
 * tienen en `ROLE_RECOVERY` (`auth/permissions.ts`); los demás la recuperan con
 * quien los administra.
 *
 * Nunca revela si una cuenta existe ni de qué rol es: pedir un enlace responde
 * siempre igual, y solo se envía el correo si la cuenta puede recuperarse así.
 */
export class PasswordRecoveryService {
  constructor(
    private readonly repository: PasswordResetRepository,
    private readonly notifier: AccountNotifier,
    private readonly options: PasswordRecoveryOptions,
  ) {}

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  /** Paso 1: «¿Olvidó su contraseña?». Siempre termina igual para quien pregunta. */
  async requestReset(email: string, clientKey: string): Promise<void> {
    // --- Límites: por equipo (responde 429) y por correo (en silencio) -------
    const { ipLimiter, emailLimiter } = this.options;

    if (ipLimiter.isBlocked(clientKey)) {
      throw HttpError.tooManyRequests(TOO_MANY);
    }

    ipLimiter.recordFailure(clientKey);

    // Si se pasa del límite de un correo, no se dice: eso revelaría que se pidió.
    if (emailLimiter.isBlocked(email)) {
      return;
    }

    emailLimiter.recordFailure(email);

    // --- Solo Administrador y Encargado, activos y con el negocio activo -----
    const account = await this.repository.findByEmail(email);

    if (!this.canRecover(account)) {
      return;
    }

    // --- Enlace nuevo: en la base, solo su hash ------------------------------
    const token = generateResetToken();
    const expiresAt = new Date(this.now().getTime() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

    await this.repository.saveToken(account.id, hashResetToken(token), expiresAt);
    this.notifier.sendResetLink(account, `${this.options.appUrl}/reset-password?token=${token}`);
  }

  /**
   * Paso 2: la contraseña nueva con el enlace. El enlace sirve una vez; al
   * usarlo se cierran todas las sesiones, queda el registro y llega el aviso.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashResetToken(token);
    const now = this.now();
    const account = await this.repository.findByToken(tokenHash, now);

    if (!this.canRecover(account)) {
      throw HttpError.badRequest(INVALID_LINK);
    }

    const completed = await this.repository.completeReset(
      account,
      tokenHash,
      await hashPassword(newPassword),
      now,
    );

    if (!completed) {
      throw HttpError.badRequest(INVALID_LINK);
    }

    this.notifier.passwordChanged(account, 'recovered');
  }

  private canRecover(account: RecoverableAccount | null): account is RecoverableAccount {
    return (
      account !== null &&
      account.email !== null &&
      account.isActive &&
      recoversByEmail(account.role) &&
      account.businessStatus !== 'SUSPENDED'
    );
  }
}
