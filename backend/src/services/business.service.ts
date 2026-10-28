import type { BusinessRepository } from '../repositories/business.repository.js';
import type { UsersRepository } from '../repositories/users.repository.js';
import type {
  BusinessDto,
  BusinessLogo,
  BusinessRecord,
  PublicBusinessDto,
} from '../types/business.js';
import { HttpError } from '../utils/http-error.js';
import { hasImageSignature } from '../utils/image.js';
import type {
  BusinessLogoInput,
  BusinessPlanInput,
  BusinessSettingsInput,
} from '../validators/business.validator.js';

/** Ruta pública del logo (también se ve en el login). */
export const LOGO_PATH = '/api/business/public/logo';

function logoUrl(record: BusinessRecord): string | null {
  return record.logoUpdatedAt === null ? null : `${LOGO_PATH}?v=${record.logoUpdatedAt.getTime()}`;
}

/**
 * Configuración › General: datos, logo y plan del negocio.
 *   - Leer: cualquier usuario con sesión (el comprobante y el menú los usan).
 *   - Datos y logo: Administrador y Encargado (`business.edit`).
 *   - Plan (límite de usuarios): solo el Administrador (`plan.manage`).
 * Antes de iniciar sesión solo se exponen el nombre y el logo.
 */
export class BusinessService {
  constructor(
    private readonly repository: BusinessRepository,
    private readonly users: Pick<UsersRepository, 'countUsedSeats'>,
  ) {}

  async get(): Promise<BusinessDto> {
    return this.toDto(await this.repository.get());
  }

  async getPublic(): Promise<PublicBusinessDto> {
    const record = await this.repository.get();

    return { name: record.name, logoUrl: logoUrl(record) };
  }

  async update(input: BusinessSettingsInput): Promise<BusinessDto> {
    return this.toDto(await this.repository.save(input));
  }

  /**
   * Bajar el límite por debajo de lo que ya se usa no desactiva a nadie: solo
   * impide crear o reactivar usuarios hasta que haya cupo.
   */
  async updatePlan(input: BusinessPlanInput): Promise<BusinessDto> {
    return this.toDto(await this.repository.setMaxUsers(input.maxUsers));
  }

  async getLogo(): Promise<BusinessLogo> {
    const logo = await this.repository.findLogo();

    if (logo === null) {
      throw HttpError.notFound('El negocio no tiene logo.');
    }

    return logo;
  }

  async setLogo(logo: BusinessLogoInput): Promise<BusinessDto> {
    if (!hasImageSignature(logo.mimeType, logo.data)) {
      throw HttpError.badRequest('El archivo no es una imagen válida del tipo indicado.');
    }

    return this.toDto(await this.repository.saveLogo(logo));
  }

  async removeLogo(): Promise<BusinessDto> {
    return this.toDto(await this.repository.removeLogo());
  }

  private async toDto(record: BusinessRecord): Promise<BusinessDto> {
    return {
      name: record.name,
      legalId: record.legalId,
      phone: record.phone,
      email: record.email,
      address: record.address,
      receiptMessage: record.receiptMessage,
      logoUrl: logoUrl(record),
      plan: { maxUsers: record.maxUsers, usedSeats: await this.users.countUsedSeats() },
    };
  }
}
