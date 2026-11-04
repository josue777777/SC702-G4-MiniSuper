import type { BusinessRepository } from '../repositories/business.repository.js';
import { maxUsersOf, type UsersRepository } from '../repositories/users.repository.js';
import type { BusinessDto, BusinessLogo, BusinessRecord } from '../types/business.js';
import { HttpError } from '../utils/http-error.js';
import { hasImageSignature } from '../utils/image.js';
import type { BusinessLogoInput, BusinessSettingsInput } from '../validators/business.validator.js';

/** Ruta del logo (con sesión: lo ven solo los usuarios de ese negocio). */
export const LOGO_PATH = '/api/business/logo';

function logoUrl(record: BusinessRecord): string | null {
  return record.logoUpdatedAt === null ? null : `${LOGO_PATH}?v=${record.logoUpdatedAt.getTime()}`;
}

/**
 * Configuración › General del negocio de la sesión: sus datos, su logo y su
 * plan (solo lectura: el plan lo cambia la plataforma).
 *   - Leer: cualquier usuario del negocio (el comprobante y el menú lo usan).
 *   - Datos y logo: el Encargado (`business.edit`).
 */
export class BusinessService {
  constructor(
    private readonly repository: BusinessRepository,
    private readonly users: Pick<UsersRepository, 'countUsedSeats'>,
  ) {}

  async get(): Promise<BusinessDto> {
    return this.toDto(await this.repository.get());
  }

  async update(input: BusinessSettingsInput): Promise<BusinessDto> {
    return this.toDto(await this.repository.save(input));
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
      plan: {
        extraUsers: record.extraUsers,
        maxUsers: maxUsersOf(record.extraUsers),
        usedSeats: await this.users.countUsedSeats(record.id),
      },
    };
  }
}
