import { prisma } from '../config/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import type { CreateUserFields, UpdateUserFields, UserRecord } from '../types/auth.js';

const userSelection = {
  id: true,
  name: true,
  email: true,
  passwordHash: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  sessionVersion: true,
  createdAt: true,
} as const;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Capa de acceso a datos de los usuarios (HU-11 a HU-15).
 *
 * Sin miembros privados a propósito: los services se prueban con un repositorio
 * falso que `implements UsersRepository`.
 */
export class UsersRepository {
  async findByEmail(email: string): Promise<UserRecord | null> {
    return prisma.user.findUnique({ where: { email }, select: userSelection });
  }

  async findById(id: string): Promise<UserRecord | null> {
    return prisma.user.findUnique({ where: { id }, select: userSelection });
  }

  /** Todos los usuarios, activos primero y por nombre. */
  async list(): Promise<UserRecord[]> {
    return prisma.user.findMany({
      select: userSelection,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  /** Administradores activos: el sistema nunca debe quedarse sin ninguno. */
  async countActiveAdmins(): Promise<number> {
    return prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
  }

  /** Crea un usuario; `null` si el correo ya lo usa otra cuenta (P2002). */
  async create(fields: CreateUserFields): Promise<UserRecord | null> {
    try {
      return await prisma.user.create({ data: fields, select: userSelection });
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

  /** Actualiza un usuario; `null` si el correo ya lo usa otra cuenta (P2002). */
  async update(id: string, fields: UpdateUserFields): Promise<UserRecord | null> {
    const { revokeSessions, ...data } = fields;

    try {
      return await prisma.user.update({
        where: { id },
        data: revokeSessions === true ? { ...data, sessionVersion: { increment: 1 } } : data,
        select: userSelection,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null;
      }

      throw error;
    }
  }
}
