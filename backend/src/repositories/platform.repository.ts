import { prisma } from '../config/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import type {
  BusinessStatus,
  BusinessSummaryDto,
  CreateBusinessFields,
  CreatedBusiness,
  CreatePlanRequestFields,
  PlanRequestDto,
  PlanRequestStatus,
  PlatformSettingsDto,
} from '../types/platform.js';
import { maxUsersOf } from './users.repository.js';

/** La fila de la plataforma (una sola, lo exige un CHECK). */
const PLATFORM_ROW = 1;

const DEFAULT_SETTINGS: PlatformSettingsDto = {
  systemName: 'MiniSuper',
  pricePerExtraUser: '5000.00',
};

/**
 * Lo que la plataforma ve de un negocio. A propósito NO incluye productos,
 * ventas ni clientes: la plataforma administra a sus clientes, no los espía.
 */
const businessSummarySelection = {
  id: true,
  name: true,
  status: true,
  extraUsers: true,
  createdAt: true,
  users: {
    where: { role: 'ENCARGADO', isActive: true },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: 'asc' },
    take: 1,
  },
  planRequests: { where: { status: 'PENDING' }, select: { id: true }, take: 1 },
} as const satisfies Prisma.BusinessSelect;

type BusinessSummaryRow = Prisma.BusinessGetPayload<{ select: typeof businessSummarySelection }>;

const requestSelection = {
  id: true,
  businessId: true,
  extraUsers: true,
  monthlyAmount: true,
  note: true,
  status: true,
  response: true,
  createdAt: true,
  decidedAt: true,
  business: { select: { name: true } },
  requestedBy: { select: { name: true } },
} as const satisfies Prisma.PlanRequestSelect;

type RequestRow = Prisma.PlanRequestGetPayload<{ select: typeof requestSelection }>;

function toRequestDto(row: RequestRow): PlanRequestDto {
  return {
    id: row.id,
    businessId: row.businessId,
    businessName: row.business.name,
    requestedBy: row.requestedBy.name,
    extraUsers: row.extraUsers,
    monthlyAmount: row.monthlyAmount.toFixed(2),
    note: row.note,
    status: row.status,
    response: row.response,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

/** Agrega a cada negocio cuántos cupos de su plan están en uso. */
async function withSeats(rows: BusinessSummaryRow[]): Promise<BusinessSummaryDto[]> {
  const seats = await prisma.user.groupBy({
    by: ['businessId'],
    where: { businessId: { in: rows.map((row) => row.id) }, isActive: true },
    _count: { _all: true },
  });
  const usedBy = new Map(seats.map((row) => [row.businessId, row._count._all]));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    extraUsers: row.extraUsers,
    maxUsers: maxUsersOf(row.extraUsers),
    usedSeats: usedBy.get(row.id) ?? 0,
    manager: row.users[0] ?? null,
    pendingRequest: row.planRequests.length > 0,
    createdAt: row.createdAt.toISOString(),
  }));
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Acceso a datos de la plataforma (solo Administrador): ajustes del sistema,
 * negocios clientes y solicitudes de ampliación. También las consultas del
 * Encargado sobre SUS solicitudes, siempre filtradas por su negocio.
 */
export class PlatformRepository {
  async getSettings(): Promise<PlatformSettingsDto> {
    const row = await prisma.platformSettings.findUnique({ where: { id: PLATFORM_ROW } });

    return row === null
      ? DEFAULT_SETTINGS
      : { systemName: row.systemName, pricePerExtraUser: row.pricePerExtraUser.toFixed(2) };
  }

  async saveSettings(settings: PlatformSettingsDto): Promise<PlatformSettingsDto> {
    const row = await prisma.platformSettings.upsert({
      where: { id: PLATFORM_ROW },
      create: { id: PLATFORM_ROW, ...settings },
      update: settings,
    });

    return { systemName: row.systemName, pricePerExtraUser: row.pricePerExtraUser.toFixed(2) };
  }

  async listBusinesses(): Promise<BusinessSummaryDto[]> {
    const rows = await prisma.business.findMany({
      select: businessSummarySelection,
      orderBy: { name: 'asc' },
    });

    return withSeats(rows);
  }

  async findBusiness(id: string): Promise<BusinessSummaryDto | null> {
    const row = await prisma.business.findUnique({
      where: { id },
      select: businessSummarySelection,
    });

    return row === null ? null : ((await withSeats([row]))[0] ?? null);
  }

  /**
   * Crea el negocio y su Encargado en UNA transacción: nunca queda un negocio
   * sin dueño ni un Encargado sin negocio. `null` si el correo ya existe.
   */
  async createBusinessWithManager(fields: CreateBusinessFields): Promise<CreatedBusiness | null> {
    try {
      const { businessId, manager } = await prisma.$transaction(async (tx) => {
        const business = await tx.business.create({
          data: { name: fields.businessName, extraUsers: fields.extraUsers },
          select: { id: true },
        });
        const created = await tx.user.create({
          data: {
            ...fields.manager,
            businessId: business.id,
            role: 'ENCARGADO',
            mustChangePassword: true,
          },
          select: { id: true, name: true, email: true },
        });

        return { businessId: business.id, manager: created };
      });
      const business = await this.findBusiness(businessId);

      if (business === null) {
        throw new Error(`El negocio ${businessId} no existe.`);
      }

      return { business, manager };
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null;
      }

      throw error;
    }
  }

  /** Cambia el plan (usuarios adicionales). `null` si el negocio no existe. */
  async setExtraUsers(id: string, extraUsers: number): Promise<BusinessSummaryDto | null> {
    const changed = await prisma.business.updateMany({ where: { id }, data: { extraUsers } });

    return changed.count === 0 ? null : this.findBusiness(id);
  }

  /** Suspende o reactiva. Suspendido: nadie del negocio entra (ver AuthService). */
  async setStatus(id: string, status: BusinessStatus): Promise<BusinessSummaryDto | null> {
    const changed = await prisma.business.updateMany({ where: { id }, data: { status } });

    return changed.count === 0 ? null : this.findBusiness(id);
  }

  async listRequests(filter: {
    status?: PlanRequestStatus;
    businessId?: string;
  }): Promise<PlanRequestDto[]> {
    const rows = await prisma.planRequest.findMany({
      where: {
        ...(filter.status === undefined ? {} : { status: filter.status }),
        ...(filter.businessId === undefined ? {} : { businessId: filter.businessId }),
      },
      select: requestSelection,
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(toRequestDto);
  }

  async countPendingRequests(): Promise<number> {
    return prisma.planRequest.count({ where: { status: 'PENDING' } });
  }

  /** Guarda la solicitud; `null` si el negocio ya tiene una pendiente (índice único parcial). */
  async createRequest(fields: CreatePlanRequestFields): Promise<PlanRequestDto | null> {
    try {
      return toRequestDto(
        await prisma.planRequest.create({ data: fields, select: requestSelection }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null;
      }

      throw error;
    }
  }

  /**
   * Resuelve una solicitud PENDIENTE en una transacción con la solicitud
   * bloqueada: al aprobar, suma los usuarios al plan del negocio. Dos clics
   * seguidos no la aprueban dos veces. `null` si no existe o ya se resolvió.
   */
  async decideRequest(
    id: string,
    decision: { status: 'APPROVED' | 'REJECTED'; decidedById: string; response: string | null },
  ): Promise<PlanRequestDto | null> {
    return prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ businessId: string; extraUsers: number }[]>`
        SELECT "businessId", "extraUsers" FROM "PlanRequest"
        WHERE "id" = ${id}::uuid AND "status" = 'PENDING'
        FOR UPDATE`;
      const pending = locked[0];

      if (pending === undefined) {
        return null;
      }

      if (decision.status === 'APPROVED') {
        await tx.business.update({
          where: { id: pending.businessId },
          data: { extraUsers: { increment: pending.extraUsers } },
        });
      }

      return toRequestDto(
        await tx.planRequest.update({
          where: { id },
          data: { ...decision, decidedAt: new Date() },
          select: requestSelection,
        }),
      );
    });
  }
}
