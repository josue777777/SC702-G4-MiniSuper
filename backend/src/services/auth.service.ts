import { createHash, timingSafeEqual } from 'node:crypto';
import type { UsersRepository } from '../repositories/users.repository.js';
import type { ProfileDto, SetupStatusDto } from '../types/auth.js';
import { HttpError } from '../utils/http-error.js';
import type { LoginRateLimiter } from '../utils/login-rate-limiter.js';
import { hashPassword, verifyAgainstDecoy, verifyPassword } from '../utils/password.js';
import {
  createSessionToken,
  passwordVersionOf,
  verifySessionToken,
} from '../utils/session-token.js';
import type { LoginInput, SetupInput } from '../validators/auth.validator.js';

export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const ALREADY_CONFIGURED = 'El sistema ya está configurado. Inicie sesión con su cuenta.';

export interface AuthServiceOptions {
  sessionSecret: string;
  /** Token que el administrador definió para la instalación (SETUP_TOKEN). */
  setupToken?: string;
  /** En producción la configuración inicial sin token queda deshabilitada. */
  requireSetupToken: boolean;
  limiter: LoginRateLimiter;
  /** Reloj inyectable para probar expiraciones. */
  now?: () => Date;
}

export interface IssuedSession {
  token: string;
  user: ProfileDto;
}

function sameSecret(received: string | undefined, expected: string): boolean {
  if (received === undefined) {
    return false;
  }

  // Se comparan los resúmenes para que ni la longitud del token se filtre por tiempo.
  const a = createHash('sha256').update(received).digest();
  const b = createHash('sha256').update(expected).digest();

  return timingSafeEqual(a, b);
}

function toProfile(user: ProfileDto): ProfileDto {
  return { id: user.id, name: user.name, email: user.email };
}

/** Reglas de negocio de la cuenta única (HU-12) y de la sesión (base de HU-11; cierre en HU-15). */
export class AuthService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly options: AuthServiceOptions,
  ) {}

  private nowSeconds(): number {
    return Math.floor((this.options.now?.() ?? new Date()).getTime() / 1000);
  }

  async getSetupStatus(): Promise<SetupStatusDto> {
    return {
      configured: (await this.repository.count()) > 0,
      tokenRequired: this.options.setupToken !== undefined,
    };
  }

  /** Crea la cuenta del dueño la primera vez; después siempre responde 409. */
  async setupOwner(input: SetupInput): Promise<ProfileDto> {
    if ((await this.repository.count()) > 0) {
      throw HttpError.conflict(ALREADY_CONFIGURED);
    }

    const { setupToken } = this.options;

    if (setupToken === undefined) {
      if (this.options.requireSetupToken) {
        throw new HttpError(
          503,
          'La configuración inicial está deshabilitada: el administrador debe definir SETUP_TOKEN en el servidor.',
        );
      }
    } else if (!sameSecret(input.setupToken, setupToken)) {
      throw HttpError.forbidden('El token de configuración no es válido.');
    }

    const created = await this.repository.createOwner({
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
    });

    // `null`: otra petición simultánea creó la cuenta primero (índice único).
    if (created === null) {
      throw HttpError.conflict(ALREADY_CONFIGURED);
    }

    return created;
  }

  /** Verifica credenciales y emite el token de sesión. El error es el mismo en todos los fallos. */
  async login(input: LoginInput, clientKey: string): Promise<IssuedSession> {
    if (this.options.limiter.isBlocked(clientKey)) {
      throw HttpError.tooManyRequests('Demasiados intentos fallidos. Intente de nuevo más tarde.');
    }

    const user = await this.repository.findByEmail(input.email);
    const valid =
      user === null
        ? (await verifyAgainstDecoy(input.password), false)
        : await verifyPassword(user.passwordHash, input.password);

    if (user === null || !valid) {
      this.options.limiter.recordFailure(clientKey);
      throw HttpError.unauthorized('Correo o contraseña incorrectos.');
    }

    this.options.limiter.reset(clientKey);

    return { token: this.issueToken(user), user: toProfile(user) };
  }

  /** Emite un token nuevo (también tras cambiar la contraseña, para no cerrar la sesión actual). */
  issueToken(user: { id: string; passwordHash: string; sessionVersion: number }): string {
    return createSessionToken(
      {
        userId: user.id,
        passwordVersion: passwordVersionOf(user.passwordHash),
        sessionVersion: user.sessionVersion,
        expiresAt: this.nowSeconds() + SESSION_TTL_SECONDS,
      },
      this.options.sessionSecret,
    );
  }

  /**
   * Usuario de la sesión, o `null` si el token es falso, venció, la contraseña
   * cambió o la sesión se cerró (HU-15).
   */
  async resolveSession(token: string | undefined): Promise<ProfileDto | null> {
    if (token === undefined) {
      return null;
    }

    const payload = verifySessionToken(token, this.options.sessionSecret, this.nowSeconds());

    if (payload === null) {
      return null;
    }

    const user = await this.repository.findById(payload.userId);

    if (
      user === null ||
      passwordVersionOf(user.passwordHash) !== payload.passwordVersion ||
      user.sessionVersion !== payload.sessionVersion
    ) {
      return null;
    }

    return toProfile(user);
  }

  /**
   * Cierra la sesión (HU-15): invalida en el servidor todo token ya emitido, de
   * modo que una copia guardada de la cookie tampoco sirve. Sin sesión válida no
   * hace nada: cerrar dos veces no es un error.
   */
  async logout(token: string | undefined): Promise<void> {
    const user = await this.resolveSession(token);

    if (user !== null) {
      await this.repository.revokeSessions(user.id);
    }
  }
}
