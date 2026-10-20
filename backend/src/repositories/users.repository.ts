import { prisma } from '../config/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import type {
  CreateOwnerFields,
  ProfileDto,
  UpdateProfileFields,
  UserRecord,
} from '../types/auth.js';

const userSelection = {
  id: true,
  name: true,
  email: true,
  passwordHash: true,
  sessionVersion: true,
} as const;
const profileSelection = { id: true, name: true, email: true } as const;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Capa de acceso a datos de la cuenta del dueño (HU-12, HU-14, HU-15).
 *
 * Sin miembros privados a propósito: el service se prueba con un repositorio
 * falso que `implements UsersRepository`.
 */
export class UsersRepository {
  /** Cantidad de cuentas (0 o 1): decide si el sistema ya fue configurado. */
  async count(): Promise<number> {
    return prisma.user.count();
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    return prisma.user.findUnique({ where: { email }, select: userSelection });
  }

  async findById(id: string): Promise<UserRecord | null> {
    return prisma.user.findUnique({ where: { id }, select: userSelection });
  }

  /**
   * Crea la cuenta del dueño, o devuelve `null` si ya existe una. La garantía
   * no depende de una consulta previa: `isOwner` es único en la base, así que
   * de dos peticiones simultáneas solo una inserta (error P2002).
   */
  async createOwner(fields: CreateOwnerFields): Promise<ProfileDto | null> {
    try {
      return await prisma.user.create({ data: fields, select: profileSelection });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null;
      }

      throw error;
    }
  }

  /**
   * Invalida todas las sesiones emitidas (HU-15). El incremento es atómico en
   * la base, así que dos cierres simultáneos no se pisan.
   */
  async revokeSessions(id: string): Promise<void> {
    await prisma.user.updateMany({ where: { id }, data: { sessionVersion: { increment: 1 } } });
  }

  /** Actualiza el perfil; `null` si el correo ya lo usa otra cuenta (P2002). */
  async update(id: string, fields: UpdateProfileFields): Promise<ProfileDto | null> {
    try {
      return await prisma.user.update({ where: { id }, data: fields, select: profileSelection });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null;
      }

      throw error;
    }
  }
}
