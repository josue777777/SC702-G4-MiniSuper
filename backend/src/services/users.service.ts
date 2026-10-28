import { canManageRole, type Role } from '../auth/permissions.js';
import type { UsersRepository } from '../repositories/users.repository.js';
import type {
  PlanFull,
  UpdateUserFields,
  UserActor,
  UserListItemDto,
  UserRecord,
} from '../types/auth.js';
import { HttpError } from '../utils/http-error.js';
import { hashPassword } from '../utils/password.js';
import { generateTemporaryPassword } from '../utils/temporary-password.js';
import type { CreateUserInput, UpdateUserInput } from '../validators/users.validator.js';

const EMAIL_IN_USE = 'Ese correo ya está en uso.';
const LAST_ADMIN = 'El sistema debe tener al menos un administrador activo.';
const OUT_OF_RANK = 'Solo puede administrar usuarios de un rango menor al suyo.';
const NOT_FOUND = 'No se encontró el usuario.';

/** Usuario con la contraseña temporal recién generada: se muestra UNA vez a quien lo creó. */
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
    businessName: user.businessName,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
  };
}

function isPlanFull(result: UserRecord | PlanFull | null): result is PlanFull {
  return result !== null && 'status' in result;
}

function planFullError({ maxUsers }: PlanFull): HttpError {
  return HttpError.conflict(
    `El plan permite ${maxUsers} usuario${maxUsers === 1 ? '' : 's'} activo${maxUsers === 1 ? '' : 's'} ` +
      'y ya están en uso. Desactive uno o pida al administrador de la plataforma ampliar el plan.',
  );
}

/**
 * Configuración › Usuarios, con jerarquía (ver `auth/permissions.ts`):
 *   - el Administrador administra a todos;
 *   - el Encargado (dueño del negocio) solo a Cajero y Bodega;
 *   - nadie asigna un rol de rango igual o mayor al propio.
 * `actor` es quien usa el sistema, tomado de la sesión. Las reglas se validan
 * aquí, en el servidor: ocultar botones en la pantalla no basta.
 *
 * El plan limita cuántos usuarios activos tiene el negocio (los administradores
 * de la plataforma no cuentan). Los usuarios no se borran, se desactivan.
 * Desactivar, cambiar el rol o restablecer la contraseña cierra sus sesiones.
 */
export class UsersService {
  constructor(private readonly repository: UsersRepository) {}

  /**
   * Lo que el actor puede administrar, más su propia cuenta:
   *   - la plataforma: administradores y Encargados de todos los negocios;
   *   - el Encargado: el personal de SU negocio.
   */
  async list(actor: UserActor): Promise<UserListItemDto[]> {
    const users =
      actor.businessId === null
        ? await this.repository.list({ roles: ['ADMIN', 'ENCARGADO'] })
        : await this.repository.list({ businessId: actor.businessId });

    return users
      .filter((user) => user.id === actor.id || canManageRole(actor.role, user.role))
      .map(toListItem);
  }

  async create(input: CreateUserInput, actor: UserActor): Promise<UserWithTemporaryPassword> {
    this.assertCanAssign(actor, input.role);

    const businessId = await this.businessForNewUser(input, actor);
    const temporaryPassword = generateTemporaryPassword();
    const created = await this.repository.createWithinPlan({
      businessId,
      name: input.name,
      email: input.email,
      role: input.role,
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
    });

    return { user: toListItem(this.saved(created)), temporaryPassword };
  }

  async update(id: string, input: UpdateUserInput, actor: UserActor): Promise<UserListItemDto> {
    const user = await this.findManageable(id, actor, { allowSelf: true });
    const changes: UpdateUserFields = {};

    if (input.name !== undefined && input.name !== user.name) {
      changes.name = input.name;
    }

    if (input.email !== undefined && input.email !== user.email) {
      changes.email = input.email;
    }

    if (input.role !== undefined && input.role !== user.role) {
      if (id === actor.id) {
        throw HttpError.conflict('No puede cambiar su propio rol.');
      }

      this.assertCanAssign(actor, input.role);

      // La plataforma y los negocios no se mezclan: un administrador no pasa a
      // ser parte de un negocio, ni un Encargado a ser de la plataforma.
      if ((user.role === 'ADMIN') !== (input.role === 'ADMIN')) {
        throw HttpError.conflict(
          'Un administrador de la plataforma no puede pasar a un negocio, ni al revés.',
        );
      }

      await this.assertAnotherActiveAdmin(user);
      changes.role = input.role;
      // Con otro rol cambian sus permisos: entra de nuevo para recibirlos.
      changes.revokeSessions = true;
    }

    if (Object.keys(changes).length === 0) {
      throw HttpError.badRequest('No hay cambios que guardar.');
    }

    // Quitarle el rol de administrador a alguien hace que ocupe un cupo del plan.
    return toListItem(this.saved(await this.repository.updateWithinPlan(id, changes)));
  }

  async deactivate(id: string, actor: UserActor): Promise<UserListItemDto> {
    if (id === actor.id) {
      throw HttpError.conflict('No puede desactivar su propia cuenta.');
    }

    const user = await this.findManageable(id, actor);

    if (!user.isActive) {
      return toListItem(user);
    }

    await this.assertAnotherActiveAdmin(user);

    return toListItem(
      this.saved(await this.repository.update(id, { isActive: false, revokeSessions: true })),
    );
  }

  /** Reactivar vuelve a ocupar un cupo del plan. */
  async activate(id: string, actor: UserActor): Promise<UserListItemDto> {
    const user = await this.findManageable(id, actor);

    if (user.isActive) {
      return toListItem(user);
    }

    return toListItem(this.saved(await this.repository.updateWithinPlan(id, { isActive: true })));
  }

  /** Contraseña temporal nueva; el usuario debe cambiarla al ingresar (HU-13). */
  async resetPassword(id: string, actor: UserActor): Promise<UserWithTemporaryPassword> {
    if (id === actor.id) {
      throw HttpError.conflict('Para cambiar su propia contraseña use «Mi perfil».');
    }

    await this.findManageable(id, actor);

    const temporaryPassword = generateTemporaryPassword();
    const updated = await this.repository.update(id, {
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      revokeSessions: true,
    });

    return { user: toListItem(this.saved(updated)), temporaryPassword };
  }

  /** El usuario existe y el actor tiene rango para administrarlo (o es él mismo, si se permite). */
  private async findManageable(
    id: string,
    actor: UserActor,
    options: { allowSelf?: boolean } = {},
  ): Promise<UserRecord> {
    const user = await this.repository.findById(id);

    // Un Encargado no ve usuarios de otros negocios: para él no existen.
    if (user === null || (actor.businessId !== null && user.businessId !== actor.businessId)) {
      throw HttpError.notFound(NOT_FOUND);
    }

    const isSelf = options.allowSelf === true && user.id === actor.id;

    if (!isSelf && !canManageRole(actor.role, user.role)) {
      throw HttpError.forbidden(OUT_OF_RANK);
    }

    return user;
  }

  /**
   * Negocio del usuario nuevo. El Encargado crea SIEMPRE en el suyo (lo que
   * mande el navegador no cuenta). La plataforma crea administradores sin
   * negocio, o Encargados del negocio que indique (que debe existir).
   */
  private async businessForNewUser(
    input: CreateUserInput,
    actor: UserActor,
  ): Promise<string | null> {
    if (actor.businessId !== null) {
      return actor.businessId;
    }

    if (input.role === 'ADMIN') {
      return null;
    }

    if (input.businessId === undefined) {
      throw HttpError.badRequest('Indique el negocio del Encargado.', {
        businessId: ['Indique el negocio del Encargado.'],
      });
    }

    if ((await this.repository.findBusinessName(input.businessId)) === null) {
      throw HttpError.badRequest('El negocio indicado no existe.', {
        businessId: ['El negocio indicado no existe.'],
      });
    }

    return input.businessId;
  }

  /** Nadie da más poder del que tiene: solo se asignan roles de rango menor. */
  private assertCanAssign(actor: UserActor, role: Role): void {
    if (!canManageRole(actor.role, role)) {
      throw HttpError.forbidden(OUT_OF_RANK);
    }
  }

  /** Traduce el resultado del repositorio: correo repetido o plan lleno son 409. */
  private saved(result: UserRecord | PlanFull | null): UserRecord {
    if (result === null) {
      throw HttpError.conflict(EMAIL_IN_USE, { email: [EMAIL_IN_USE] });
    }

    if (isPlanFull(result)) {
      throw planFullError(result);
    }

    return result;
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
