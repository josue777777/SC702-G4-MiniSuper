import { prisma } from '../config/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import type {
  CreateUserFields,
  PlanFull,
  UpdateUserFields,
  UserListFilter,
  UserRecord,
} from '../types/auth.js';

const userSelection = {
  id: true,
  name: true,
  email: true,
  passwordHash: true,
  role: true,
  businessId: true,
  isActive: true,
  mustChangePassword: true,
  sessionVersion: true,
  createdAt: true,
  business: { select: { name: true, status: true } },
} as const;

type Transaction = Prisma.TransactionClient;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelection }>;

function toRecord({ business, ...user }: UserRow): UserRecord {
  return {
    ...user,
    businessName: business?.name ?? null,
    businessStatus: business?.status ?? null,
  };
}

/** ¿Ocupa un cupo del plan? Los administradores de la plataforma no cuentan. */
function usesSeat(user: { role: string; isActive: boolean }): boolean {
  return user.isActive && user.role !== 'ADMIN';
}

/** El plan permite al Encargado más sus usuarios adicionales. */
export function maxUsersOf(extraUsers: number): number {
  return 1 + extraUsers;
}

/**
 * Bloquea la fila del negocio hasta que termine la transacción y devuelve el
 * límite de su plan. Así, dos altas al mismo tiempo en el mismo negocio se
 * atienden de una en una y nunca pasan del límite.
 */
async function lockPlan(tx: Transaction, businessId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ extraUsers: number }[]>`
    SELECT "extraUsers" FROM "Business" WHERE "id" = ${businessId}::uuid FOR UPDATE`;

  return maxUsersOf(rows[0]?.extraUsers ?? 0);
}

function countUsedSeats(tx: Transaction | typeof prisma, businessId: string): Promise<number> {
  return tx.user.count({ where: { businessId, isActive: true, role: { not: 'ADMIN' } } });
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
    const row = await prisma.user.findUnique({ where: { email }, select: userSelection });

    return row === null ? null : toRecord(row);
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = await prisma.user.findUnique({ where: { id }, select: userSelection });

    return row === null ? null : toRecord(row);
  }

  /** Usuarios de un negocio, o de ciertos roles; activos primero y por nombre. */
  async list(filter: UserListFilter): Promise<UserRecord[]> {
    const rows = await prisma.user.findMany({
      where: {
        ...(filter.businessId === undefined ? {} : { businessId: filter.businessId }),
        ...(filter.roles === undefined ? {} : { role: { in: filter.roles } }),
      },
      select: userSelection,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });

    return rows.map(toRecord);
  }

  /** Nombre del negocio, o `null` si no existe (para crear su Encargado). */
  async findBusinessName(businessId: string): Promise<string | null> {
    const row = await prisma.business.findUnique({
      where: { id: businessId },
      select: { name: true },
    });

    return row?.name ?? null;
  }

  /** Administradores activos: el sistema nunca debe quedarse sin ninguno. */
  async countActiveAdmins(): Promise<number> {
    return prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
  }

  /** Cupos del plan en uso en un negocio: usuarios activos de ese negocio. */
  async countUsedSeats(businessId: string): Promise<number> {
    return countUsedSeats(prisma, businessId);
  }

  /**
   * Crea el usuario. Si es de un negocio, exige cupo en su plan, todo en una
   * transacción con el negocio bloqueado. `null` si el correo ya lo usa otra
   * cuenta.
   */
  async createWithinPlan(fields: CreateUserFields): Promise<UserRecord | PlanFull | null> {
    const { businessId } = fields;

    try {
      return await prisma.$transaction(async (tx) => {
        if (businessId !== null) {
          const maxUsers = await lockPlan(tx, businessId);

          if ((await countUsedSeats(tx, businessId)) >= maxUsers) {
            return { status: 'plan-full', maxUsers } as const;
          }
        }

        return toRecord(await tx.user.create({ data: fields, select: userSelection }));
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
   * (reactivarlo) exige que quede cupo en el plan de su negocio, con el negocio
   * bloqueado. `null` si el correo ya lo usa otra cuenta.
   */
  async updateWithinPlan(
    id: string,
    fields: UpdateUserFields,
  ): Promise<UserRecord | PlanFull | null> {
    const { revokeSessions, ...data } = fields;

    try {
      return await prisma.$transaction(async (tx) => {
        const current = await tx.user.findUniqueOrThrow({ where: { id }, select: userSelection });
        const after = {
          role: data.role ?? current.role,
          isActive: data.isActive ?? current.isActive,
        };

        if (current.businessId !== null && usesSeat(after) && !usesSeat(current)) {
          const maxUsers = await lockPlan(tx, current.businessId);

          if ((await countUsedSeats(tx, current.businessId)) >= maxUsers) {
            return { status: 'plan-full', maxUsers } as const;
          }
        }

        return toRecord(
          await tx.user.update({
            where: { id },
            data: revokeSessions === true ? { ...data, sessionVersion: { increment: 1 } } : data,
            select: userSelection,
          }),
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null;
      }

      throw error;
    }
  }

  /** Crea un usuario sin revisar el plan (administrador inicial); `null` si el correo ya existe. */
  async create(fields: CreateUserFields): Promise<UserRecord | null> {
    try {
      return toRecord(await prisma.user.create({ data: fields, select: userSelection }));
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
      return toRecord(
        await prisma.user.update({
          where: { id },
          data: revokeSessions === true ? { ...data, sessionVersion: { increment: 1 } } : data,
          select: userSelection,
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null;
      }

      throw error;
    }
  }
}
