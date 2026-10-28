import type { UsersRepository } from '../repositories/users.repository.js';
import type { UpdateUserFields, UserListItemDto, UserRecord } from '../types/auth.js';
import { HttpError } from '../utils/http-error.js';
import { hashPassword } from '../utils/password.js';
import { generateTemporaryPassword } from '../utils/temporary-password.js';
import type { CreateUserInput, UpdateUserInput } from '../validators/users.validator.js';

const EMAIL_IN_USE = 'Ese correo ya está en uso.';
const LAST_ADMIN = 'El sistema debe tener al menos un administrador activo.';

/** Usuario con la contraseña temporal recién generada: se muestra UNA vez al administrador. */
export interface UserWithTemporaryPassword {
  user: UserListItemDto;
  temporaryPassword: string;
}

export function toListItem(user: UserRecord): UserListItemDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * Configuración › Usuarios (HU-12, criterios de usuarios y roles). Solo llega
 * aquí el Administrador (lo exige la ruta). `actorId` es el administrador de la
 * sesión: se usa para que no se quite el acceso a sí mismo.
 *
 * Los usuarios no se borran, se desactivan. Desactivar, cambiar el rol o
 * restablecer la contraseña cierra las sesiones abiertas de ese usuario.
 */
export class UsersService {
  constructor(private readonly repository: UsersRepository) {}

  async list(): Promise<UserListItemDto[]> {
    return (await this.repository.list()).map(toListItem);
  }

  async create(input: CreateUserInput): Promise<UserWithTemporaryPassword> {
    const temporaryPassword = generateTemporaryPassword();
    const created = await this.repository.create({
      name: input.name,
      email: input.email,
      role: input.role,
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
    });

    if (created === null) {
      throw HttpError.conflict(EMAIL_IN_USE, { email: [EMAIL_IN_USE] });
    }

    return { user: toListItem(created), temporaryPassword };
  }

  async update(id: string, input: UpdateUserInput, actorId: string): Promise<UserListItemDto> {
    const user = await this.findOrFail(id);
    const changes: UpdateUserFields = {};

    if (input.name !== undefined && input.name !== user.name) {
      changes.name = input.name;
    }

    if (input.email !== undefined && input.email !== user.email) {
      changes.email = input.email;
    }

    if (input.role !== undefined && input.role !== user.role) {
      if (id === actorId) {
        throw HttpError.conflict('No puede cambiar su propio rol.');
      }

      await this.assertAnotherActiveAdmin(user);
      changes.role = input.role;
      // Con otro rol cambian sus permisos: entra de nuevo para recibirlos.
      changes.revokeSessions = true;
    }

    if (Object.keys(changes).length === 0) {
      throw HttpError.badRequest('No hay cambios que guardar.');
    }

    return toListItem(await this.save(id, changes));
  }

  async deactivate(id: string, actorId: string): Promise<UserListItemDto> {
    if (id === actorId) {
      throw HttpError.conflict('No puede desactivar su propia cuenta.');
    }

    const user = await this.findOrFail(id);

    if (!user.isActive) {
      return toListItem(user);
    }

    await this.assertAnotherActiveAdmin(user);

    return toListItem(await this.save(id, { isActive: false, revokeSessions: true }));
  }

  async activate(id: string): Promise<UserListItemDto> {
    const user = await this.findOrFail(id);

    return user.isActive ? toListItem(user) : toListItem(await this.save(id, { isActive: true }));
  }

  /** Contraseña temporal nueva; el usuario debe cambiarla al ingresar (HU-13). */
  async resetPassword(id: string, actorId: string): Promise<UserWithTemporaryPassword> {
    if (id === actorId) {
      throw HttpError.conflict('Para cambiar su propia contraseña use «Mi perfil».');
    }

    await this.findOrFail(id);

    const temporaryPassword = generateTemporaryPassword();
    const updated = await this.save(id, {
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      revokeSessions: true,
    });

    return { user: toListItem(updated), temporaryPassword };
  }

  private async findOrFail(id: string): Promise<UserRecord> {
    const user = await this.repository.findById(id);

    if (user === null) {
      throw HttpError.notFound('No se encontró el usuario.');
    }

    return user;
  }

  private async save(id: string, changes: UpdateUserFields): Promise<UserRecord> {
    const updated = await this.repository.update(id, changes);

    if (updated === null) {
      throw HttpError.conflict(EMAIL_IN_USE, { email: [EMAIL_IN_USE] });
    }

    return updated;
  }

  /** Quitarle el rol o desactivar a un administrador activo exige que quede otro. */
  private async assertAnotherActiveAdmin(user: UserRecord): Promise<void> {
    if (
      user.role === 'ADMIN' &&
      user.isActive &&
      (await this.repository.countActiveAdmins()) <= 1
    ) {
      throw HttpError.conflict(LAST_ADMIN);
    }
  }
}
