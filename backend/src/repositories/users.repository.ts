import { prisma } from '../config/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import type { CreateUserFields, PlanFull, UpdateUserFields, UserRecord } from '../types/auth.js';
import { DEFAULT_MAX_USERS } from './business.repository.js';

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

type Transaction = Prisma.TransactionClient;

/** ¿Ocupa un cupo del plan? Los administradores de la plataforma no cuentan. */
function usesSeat(user: { role: string; isActive: boolean }): boolean {
  return user.isActive && user.role !== 'ADMIN';
}

/**
 * Bloquea la fila del plan hasta que termine la transacción y devuelve el
 * límite. Así, dos altas al mismo tiempo se atienden de una en una y nunca se
 * pasa del límite (sin el bloqueo, ambas podrían contar «queda 1» a la vez).
 */
async function lockPlan(tx: Transaction): Promise<number> {
  const rows = await tx.$queryRaw<{ maxUsers: number }[]>`
    SELECT "maxUsers" FROM "BusinessSettings" WHERE "id" = 1 FOR UPDATE`;

  return rows[0]?.maxUsers ?? DEFAULT_MAX_USERS;
}

function countUsedSeats(tx: Transaction | typeof prisma): Promise<number> {
  return tx.user.count({ where: { isActive: true, role: { not: 'ADMIN' } } });
}

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

  /** Cupos del plan en uso: usuarios activos que no son administradores. */
  async countUsedSeats(): Promise<number> {
    return countUsedSeats(prisma);
  }

  /**
   * Crea el usuario si el plan tiene cupo, todo en una transacción con el plan
   * bloqueado. `null` si el correo ya lo usa otra cuenta.
   */
  async createWithinPlan(fields: CreateUserFields): Promise<UserRecord | PlanFull | null> {
    try {
      return await prisma.$transaction(async (tx) => {
        const maxUsers = await lockPlan(tx);

        if (usesSeat({ ...fields, isActive: true }) && (await countUsedSeats(tx)) >= maxUsers) {
          return { status: 'plan-full', maxUsers } as const;
        }

        return tx.user.create({ data: fields, select: userSelection });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null;
      }

      throw error;
    }
  }

  /**
   * Como `update`, pero si el cambio hace que el usuario pase a ocupar un cupo
   * (reactivarlo, o quitarle el rol de administrador) exige que quede cupo,
   * con el plan bloqueado. `null` si el correo ya lo usa otra cuenta.
   */
  async updateWithinPlan(
    id: string,
    fields: UpdateUserFields,
  ): Promise<UserRecord | PlanFull | null> {
    const { revokeSessions, ...data } = fields;

    try {
      return await prisma.$transaction(async (tx) => {
        const maxUsers = await lockPlan(tx);
        const current = await tx.user.findUniqueOrThrow({ where: { id }, select: userSelection });
        const after = {
          role: data.role ?? current.role,
          isActive: data.isActive ?? current.isActive,
        };

        if (usesSeat(after) && !usesSeat(current) && (await countUsedSeats(tx)) >= maxUsers) {
          return { status: 'plan-full', maxUsers } as const;
        }

        return tx.user.update({
          where: { id },
          data: revokeSessions === true ? { ...data, sessionVersion: { increment: 1 } } : data,
          select: userSelection,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null;
      }

      throw error;
    }
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
