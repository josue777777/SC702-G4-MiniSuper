import type { PlatformRepository } from '../repositories/platform.repository.js';
import { maxUsersOf } from '../repositories/users.repository.js';
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
import { TEST_BUSINESS_ID } from './fake-session.js';

/** Doble del repositorio de la plataforma (sin base de datos). */
export class FakePlatformRepository implements PlatformRepository {
  settings: PlatformSettingsDto = { systemName: 'MiniSuper', pricePerExtraUser: '5000.00' };
  businesses: BusinessSummaryDto[] = [
    {
      id: TEST_BUSINESS_ID,
      name: 'Negocio de prueba',
      status: 'ACTIVE',
      extraUsers: 4,
      maxUsers: 5,
      usedSeats: 3,
      manager: {
        id: '22222222-1111-4111-8111-111111111111',
        name: 'Elena',
        email: 'encargado@correo.cr',
      },
      pendingRequest: false,
      createdAt: '2026-10-01T12:00:00.000Z',
    },
  ];
  requests: PlanRequestDto[] = [];
  readonly emails = new Set<string>(['encargado@correo.cr']);
  private nextId = 1;

  private id(): string {
    return `0c000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`;
  }

  getSettings(): Promise<PlatformSettingsDto> {
    return Promise.resolve({ ...this.settings });
  }

  saveSettings(settings: PlatformSettingsDto): Promise<PlatformSettingsDto> {
    this.settings = { ...settings };

    return this.getSettings();
  }

  listBusinesses(): Promise<BusinessSummaryDto[]> {
    return Promise.resolve(this.businesses.map((business) => this.withPending(business)));
  }

  findBusiness(id: string): Promise<BusinessSummaryDto | null> {
    const found = this.businesses.find((business) => business.id === id);

    return Promise.resolve(found === undefined ? null : this.withPending(found));
  }

  createBusinessWithManager(fields: CreateBusinessFields): Promise<CreatedBusiness | null> {
    if (this.emails.has(fields.manager.email)) {
      return Promise.resolve(null);
    }

    this.emails.add(fields.manager.email);

    const manager = { id: this.id(), name: fields.manager.name, email: fields.manager.email };
    const business: BusinessSummaryDto = {
      id: this.id(),
      name: fields.businessName,
      status: 'ACTIVE',
      extraUsers: fields.extraUsers,
      maxUsers: maxUsersOf(fields.extraUsers),
      usedSeats: 1,
      manager,
      pendingRequest: false,
      createdAt: '2026-10-29T12:00:00.000Z',
    };

    this.businesses.push(business);

    return Promise.resolve({ business, manager });
  }

  setExtraUsers(id: string, extraUsers: number): Promise<BusinessSummaryDto | null> {
    return this.change(id, { extraUsers, maxUsers: maxUsersOf(extraUsers) });
  }

  setStatus(id: string, status: BusinessStatus): Promise<BusinessSummaryDto | null> {
    return this.change(id, { status });
  }

  listRequests(filter: {
    status?: PlanRequestStatus;
    businessId?: string;
  }): Promise<PlanRequestDto[]> {
    return Promise.resolve(
      this.requests.filter(
        (request) =>
          (filter.status === undefined || request.status === filter.status) &&
          (filter.businessId === undefined || request.businessId === filter.businessId),
      ),
    );
  }

  countPendingRequests(): Promise<number> {
    return Promise.resolve(this.requests.filter((request) => request.status === 'PENDING').length);
  }

  /** Igual que el índice único parcial: una sola pendiente por negocio. */
  createRequest(fields: CreatePlanRequestFields): Promise<PlanRequestDto | null> {
    if (this.requests.some((r) => r.businessId === fields.businessId && r.status === 'PENDING')) {
      return Promise.resolve(null);
    }

    const request: PlanRequestDto = {
      id: this.id(),
      businessId: fields.businessId,
      businessName: this.businesses.find((b) => b.id === fields.businessId)?.name ?? '',
      requestedBy: 'Elena',
      extraUsers: fields.extraUsers,
      monthlyAmount: fields.monthlyAmount,
      note: fields.note,
      status: 'PENDING',
      response: null,
      createdAt: '2026-10-29T12:00:00.000Z',
      decidedAt: null,
    };

    this.requests.push(request);

    return Promise.resolve(request);
  }

  async decideRequest(
    id: string,
    decision: { status: 'APPROVED' | 'REJECTED'; decidedById: string; response: string | null },
  ): Promise<PlanRequestDto | null> {
    const request = this.requests.find((r) => r.id === id && r.status === 'PENDING');

    if (request === undefined) {
      return null;
    }

    if (decision.status === 'APPROVED') {
      const business = this.businesses.find((b) => b.id === request.businessId);

      if (business !== undefined) {
        await this.setExtraUsers(business.id, business.extraUsers + request.extraUsers);
      }
    }

    Object.assign(request, {
      status: decision.status,
      response: decision.response,
      decidedAt: '2026-10-29T13:00:00.000Z',
    });

    return request;
  }

  private change(
    id: string,
    changes: Partial<BusinessSummaryDto>,
  ): Promise<BusinessSummaryDto | null> {
    const business = this.businesses.find((b) => b.id === id);

    if (business === undefined) {
      return Promise.resolve(null);
    }

    Object.assign(business, changes);

    return this.findBusiness(id);
  }

  private withPending(business: BusinessSummaryDto): BusinessSummaryDto {
    return {
      ...business,
      pendingRequest: this.requests.some(
        (request) => request.businessId === business.id && request.status === 'PENDING',
      ),
    };
  }
}
