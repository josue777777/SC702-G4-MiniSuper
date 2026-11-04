import { permissionsOf } from '../auth/permissions.js';
import type { UsersRepository } from '../repositories/users.repository.js';
import type { SessionUserDto, UserRecord } from '../types/auth.js';
import { HttpError } from '../utils/http-error.js';
import type { LoginRateLimiter } from '../utils/login-rate-limiter.js';
import { verifyAgainstDecoy, verifyPassword } from '../utils/password.js';
import {
  createSessionToken,
  passwordVersionOf,
  verifySessionToken,
} from '../utils/session-token.js';
import type { LoginInput } from '../validators/auth.validator.js';

export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const INVALID_CREDENTIALS = 'Correo o contraseña incorrectos.';
const BUSINESS_SUSPENDED =
  'El acceso de su negocio está suspendido. Comuníquese con el proveedor del sistema.';

export interface AuthServiceOptions {
  sessionSecret: string;
  limiter: LoginRateLimiter;
  /** Reloj inyectable para probar expiraciones. */
  now?: () => Date;
}

export interface IssuedSession {
  token: string;
  user: SessionUserDto;
}

/** Lo que la sesión expone del usuario: nunca el hash ni datos internos. */
export function toSessionUser(user: UserRecord): SessionUserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    businessId: user.businessId,
    permissions: permissionsOf(user.role),
    mustChangePassword: user.mustChangePassword,
  };
}

/**
 * Reglas del inicio y cierre de sesión (HU-11, HU-15). Los usuarios los crea el
 * administrador (`users.service.ts`) o el comando del administrador inicial:
 * no existe registro público.
 */
export class AuthService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly options: AuthServiceOptions,
  ) {}

  private nowSeconds(): number {
    return Math.floor((this.options.now?.() ?? new Date()).getTime() / 1000);
  }

  /**
   * Verifica credenciales y emite el token de sesión. El error es el mismo en
   * todos los fallos, incluido un usuario desactivado: no se revela qué falló.
   */
  async login(input: LoginInput, clientKey: string): Promise<IssuedSession> {
    if (this.options.limiter.isBlocked(clientKey)) {
      throw HttpError.tooManyRequests('Demasiados intentos fallidos. Intente de nuevo más tarde.');
    }

    const user = await this.repository.findByEmail(input.email);
    const valid =
      user === null
        ? (await verifyAgainstDecoy(input.password), false)
        : await verifyPassword(user.passwordHash, input.password);

    if (user === null || !valid || !user.isActive) {
      this.options.limiter.recordFailure(clientKey);
      throw HttpError.unauthorized(INVALID_CREDENTIALS);
    }

    this.options.limiter.reset(clientKey);

    // Solo se dice después de comprobar la contraseña: a un extraño no se le revela nada.
    if (user.businessStatus === 'SUSPENDED') {
      throw HttpError.forbidden(BUSINESS_SUSPENDED);
    }

    return { token: this.issueToken(user), user: toSessionUser(user) };
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
   * cambió, la sesión se cerró (HU-15), el administrador lo desactivó o le
   * cambió el rol.
   */
  async resolveSession(token: string | undefined): Promise<SessionUserDto | null> {
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
      !user.isActive ||
      passwordVersionOf(user.passwordHash) !== payload.passwordVersion ||
      user.sessionVersion !== payload.sessionVersion ||
      // Suspender un negocio corta al instante las sesiones de toda su gente.
      user.businessStatus === 'SUSPENDED'
    ) {
      return null;
    }

    return toSessionUser(user);
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
