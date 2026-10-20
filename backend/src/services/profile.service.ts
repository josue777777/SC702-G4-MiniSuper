import type { UsersRepository } from '../repositories/users.repository.js';
import type { ProfileDto, UpdateProfileFields } from '../types/auth.js';
import { HttpError } from '../utils/http-error.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import type { UpdateProfileInput } from '../validators/auth.validator.js';

export interface UpdatedProfile {
  profile: ProfileDto;
  /** Datos para renovar la cookie si cambió la contraseña (el hash viejo invalida el token). */
  renewedSession?: { passwordHash: string; sessionVersion: number };
}

/**
 * Reglas del perfil del dueño (HU-14). El `userId` siempre sale de la sesión
 * verificada por el middleware, nunca del cuerpo de la petición.
 */
export class ProfileService {
  constructor(private readonly repository: UsersRepository) {}

  async getProfile(userId: string): Promise<ProfileDto> {
    const user = await this.repository.findById(userId);

    if (user === null) {
      throw HttpError.notFound('No se encontró la cuenta.');
    }

    return { id: user.id, name: user.name, email: user.email };
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

    const changes: UpdateProfileFields = {};

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
      profile: updated,
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
