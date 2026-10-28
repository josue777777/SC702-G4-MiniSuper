import { DEFAULT_BUSINESS, type BusinessRepository } from '../repositories/business.repository.js';
import type { BusinessSettingsDto } from '../types/business.js';

/** Doble del repositorio de datos del negocio (sin base de datos). */
export class FakeBusinessRepository implements BusinessRepository {
  current: BusinessSettingsDto = { ...DEFAULT_BUSINESS };

  get(): Promise<BusinessSettingsDto> {
    return Promise.resolve({ ...this.current });
  }

  save(fields: BusinessSettingsDto): Promise<BusinessSettingsDto> {
    this.current = { ...fields };

    return Promise.resolve({ ...this.current });
  }
}
