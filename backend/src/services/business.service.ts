import type { BusinessRepository } from '../repositories/business.repository.js';
import type { BusinessSettingsDto, PublicBusinessDto } from '../types/business.js';
import type { BusinessSettingsInput } from '../validators/business.validator.js';

/**
 * Configuración › General: datos del negocio. Cualquier usuario con sesión los
 * lee (el comprobante y el menú los usan); solo el Administrador los cambia
 * (lo exige la ruta). Antes de iniciar sesión solo se expone el nombre.
 */
export class BusinessService {
  constructor(private readonly repository: BusinessRepository) {}

  get(): Promise<BusinessSettingsDto> {
    return this.repository.get();
  }

  async getPublic(): Promise<PublicBusinessDto> {
    return { name: (await this.repository.get()).name };
  }

  update(input: BusinessSettingsInput): Promise<BusinessSettingsDto> {
    return this.repository.save(input);
  }
}
