import type { BusinessRepository } from '../repositories/business.repository.js';
import type { BusinessLogo, BusinessRecord, BusinessSettingsDto } from '../types/business.js';
import { TEST_BUSINESS_ID } from './fake-session.js';

/** Doble del repositorio de datos del negocio (sin base de datos). */
export class FakeBusinessRepository implements BusinessRepository {
  readonly businessId = TEST_BUSINESS_ID;
  current: BusinessRecord = {
    id: TEST_BUSINESS_ID,
    name: 'Abastecedor Nuevo Amanecer',
    legalId: null,
    phone: null,
    email: null,
    address: null,
    receiptMessage: '¡Gracias por su compra!',
    extraUsers: 4,
    status: 'ACTIVE',
    logoUpdatedAt: null,
  };
  logo: BusinessLogo | null = null;

  get(): Promise<BusinessRecord> {
    return Promise.resolve({ ...this.current });
  }

  save(fields: BusinessSettingsDto): Promise<BusinessRecord> {
    this.current = { ...this.current, ...fields };

    return this.get();
  }

  findLogo(): Promise<BusinessLogo | null> {
    return Promise.resolve(this.logo);
  }

  saveLogo(logo: BusinessLogo): Promise<BusinessRecord> {
    this.logo = logo;
    this.current = { ...this.current, logoUpdatedAt: new Date('2026-10-28T12:00:00Z') };

    return this.get();
  }

  removeLogo(): Promise<BusinessRecord> {
    this.logo = null;
    this.current = { ...this.current, logoUpdatedAt: null };

    return this.get();
  }
}
