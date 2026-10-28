import type { PlatformRepository } from '../repositories/platform.repository.js';
import type {
  BusinessSummaryDto,
  PlanRequestDto,
  PlanRequestStatus,
  PlatformSettingsDto,
  PublicPlatformDto,
} from '../types/platform.js';
import { HttpError } from '../utils/http-error.js';
import { formatCents, toCents } from '../utils/money.js';
import { hashPassword } from '../utils/password.js';
import { generateTemporaryPassword } from '../utils/temporary-password.js';
import type {
  CreateBusinessInput,
  PlanRequestInput,
  PlatformSettingsInput,
} from '../validators/platform.validator.js';

const BUSINESS_NOT_FOUND = 'No se encontró el negocio.';
const EMAIL_IN_USE = 'Ese correo ya está en uso.';

/** Negocio recién creado con la contraseña temporal de su Encargado (se muestra una vez). */
export interface BusinessWithManager {
  business: BusinessSummaryDto;
  manager: { id: string; name: string; email: string; temporaryPassword: string };
}

/**
 * La plataforma (solo Administrador, permiso `platform.manage`):
 *   - el nombre del sistema y el precio por usuario adicional;
 *   - alta de negocios clientes con su Encargado y su plan;
 *   - plan (usuarios adicionales) y suspensión de cada negocio;
 *   - la bandeja de solicitudes de ampliación.
 * Nunca toca los datos internos de un negocio (ventas, productos, clientes).
 */
export class PlatformService {
  constructor(private readonly repository: PlatformRepository) {}

  async getPublic(): Promise<PublicPlatformDto> {
    return { systemName: (await this.repository.getSettings()).systemName };
  }

  getSettings(): Promise<PlatformSettingsDto> {
    return this.repository.getSettings();
  }

  updateSettings(input: PlatformSettingsInput): Promise<PlatformSettingsDto> {
    return this.repository.saveSettings(input);
  }

  listBusinesses(): Promise<BusinessSummaryDto[]> {
    return this.repository.listBusinesses();
  }

  /** Alta de un cliente: el negocio, su plan y su Encargado, de una vez. */
  async createBusiness(input: CreateBusinessInput): Promise<BusinessWithManager> {
    const temporaryPassword = generateTemporaryPassword();
    const created = await this.repository.createBusinessWithManager({
      businessName: input.businessName,
      extraUsers: input.extraUsers,
      manager: {
        name: input.managerName,
        email: input.managerEmail,
        passwordHash: await hashPassword(temporaryPassword),
      },
    });

    if (created === null) {
      throw HttpError.conflict(EMAIL_IN_USE, { managerEmail: [EMAIL_IN_USE] });
    }

    return { business: created.business, manager: { ...created.manager, temporaryPassword } };
  }

  /**
   * Cambia el plan. Bajarlo por debajo de lo que ya se usa no desactiva a
   * nadie: solo impide crear o reactivar usuarios hasta que haya cupo.
   */
  async setPlan(id: string, extraUsers: number): Promise<BusinessSummaryDto> {
    return this.found(await this.repository.setExtraUsers(id, extraUsers));
  }

  /** Suspender corta al instante las sesiones de todo el negocio; sus datos se conservan. */
  async suspend(id: string): Promise<BusinessSummaryDto> {
    return this.found(await this.repository.setStatus(id, 'SUSPENDED'));
  }

  async activate(id: string): Promise<BusinessSummaryDto> {
    return this.found(await this.repository.setStatus(id, 'ACTIVE'));
  }

  listRequests(status?: PlanRequestStatus): Promise<PlanRequestDto[]> {
    return this.repository.listRequests(status === undefined ? {} : { status });
  }

  async approve(id: string, adminId: string, response: string | null): Promise<PlanRequestDto> {
    return this.decided(
      await this.repository.decideRequest(id, {
        status: 'APPROVED',
        decidedById: adminId,
        response,
      }),
    );
  }

  async reject(id: string, adminId: string, response: string | null): Promise<PlanRequestDto> {
    return this.decided(
      await this.repository.decideRequest(id, {
        status: 'REJECTED',
        decidedById: adminId,
        response,
      }),
    );
  }

  /** Solicitudes del Encargado: solo las de SU negocio. */
  listOwnRequests(businessId: string): Promise<PlanRequestDto[]> {
    return this.repository.listRequests({ businessId });
  }

  /** El Encargado pide más usuarios; el monto se cotiza con el precio vigente y queda guardado. */
  async requestMoreUsers(
    businessId: string,
    requestedById: string,
    input: PlanRequestInput,
  ): Promise<PlanRequestDto> {
    const { pricePerExtraUser } = await this.repository.getSettings();
    const created = await this.repository.createRequest({
      businessId,
      requestedById,
      extraUsers: input.extraUsers,
      monthlyAmount: formatCents(toCents(pricePerExtraUser) * BigInt(input.extraUsers)),
      note: input.note,
    });

    if (created === null) {
      throw HttpError.conflict(
        'Ya tiene una solicitud pendiente. Espere la respuesta antes de enviar otra.',
      );
    }

    return created;
  }

  private found(business: BusinessSummaryDto | null): BusinessSummaryDto {
    if (business === null) {
      throw HttpError.notFound(BUSINESS_NOT_FOUND);
    }

    return business;
  }

  private decided(request: PlanRequestDto | null): PlanRequestDto {
    if (request === null) {
      throw HttpError.conflict('La solicitud no existe o ya fue resuelta.');
    }

    return request;
  }
}
