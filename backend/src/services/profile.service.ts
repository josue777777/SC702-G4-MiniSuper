import type { UsersRepository } from '../repositories/users.repository.js';
import { toSessionUser } from './auth.service.js';
import type { SessionUserDto, UpdateUserFields } from '../types/auth.js';
import { HttpError } from '../utils/http-error.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import type { UpdateProfileInput } from '../validators/auth.validator.js';

export interface UpdatedProfile {
  profile: SessionUserDto;
  /** Datos para renovar la cookie si cambió la contraseña (el hash viejo invalida el token). */
  renewedSession?: { passwordHash: string; sessionVersion: number };
}

/**
 * Reglas del perfil propio (HU-14). El `userId` siempre sale de la sesión
 * verificada por el middleware, nunca del cuerpo de la petición. El usuario
 * cambia su nombre, correo y contraseña; el rol y el estado solo los cambia el
 * administrador (`users.service.ts`).
 */
export class ProfileService {
  constructor(private readonly repository: UsersRepository) {}

  async getProfile(userId: string): Promise<SessionUserDto> {
    const user = await this.repository.findById(userId);

    if (user === null) {
      throw HttpError.notFound('No se encontró la cuenta.');
    }

    return toSessionUser(user);
  }

  /**
   * Actualiza nombre, correo y/o contraseña. Cambiar el correo o la contraseña
   * exige la contraseña actual: una sesión abierta y desatendida no basta para
   * tomar la cuenta.
   */
  async updateProfile(userId: string, input: UpdateProfileInput): Promise<UpdatedProfile> {
    const user = await this.repository.findById(userId);

    if (user === null) {
      throw HttpError.notFound('No se encontró la cuenta.');
    }

    const changes: UpdateUserFields = {};

    if (input.name !== undefined && input.name !== user.name) {
      changes.name = input.name;
    }

    const emailChanged = input.email !== undefined && input.email !== user.email;

    if (emailChanged) {
      changes.email = input.email;
    }

    if (input.newPassword !== undefined) {
      if (input.newPassword === input.currentPassword) {
        throw HttpError.badRequest('La contraseña nueva debe ser distinta de la actual.', {
          newPassword: ['La contraseña nueva debe ser distinta de la actual.'],
        });
      }

      changes.passwordHash = await hashPassword(input.newPassword);
      // Una contraseña elegida por el propio usuario deja de ser temporal.
      changes.mustChangePassword = false;
    }

    if (Object.keys(changes).length === 0) {
      throw HttpError.badRequest('No hay cambios que guardar.');
    }

    if (emailChanged || changes.passwordHash !== undefined) {
      if (
        input.currentPassword === undefined ||
        !(await verifyPassword(user.passwordHash, input.currentPassword))
      ) {
        throw HttpError.forbidden(
          'Para cambiar el correo o la contraseña, escriba su contraseña actual correcta.',
        );
      }
    }

    const updated = await this.repository.update(userId, changes);

    if (updated === null) {
      throw HttpError.conflict('Ese correo ya está en uso.');
    }

    return {
      profile: toSessionUser(updated),
      ...(changes.passwordHash === undefined
        ? {}
        : {
            renewedSession: {
              passwordHash: changes.passwordHash,
              sessionVersion: user.sessionVersion,
            },
          }),
    };
  }
}
