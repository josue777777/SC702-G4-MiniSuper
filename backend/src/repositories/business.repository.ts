import { prisma } from '../config/prisma.js';
import type { BusinessLogo, BusinessRecord, BusinessSettingsDto } from '../types/business.js';
import type { ImageMimeType } from '../utils/image.js';

/** Todo menos los bytes del logo: esos solo se leen al pedir la imagen. */
const selection = {
  id: true,
  name: true,
  legalId: true,
  phone: true,
  email: true,
  address: true,
  receiptMessage: true,
  extraUsers: true,
  status: true,
  logoUpdatedAt: true,
} as const;

/**
 * Datos del negocio de la sesión (Configuración › General). Atado a UN
 * negocio: el Encargado solo lee y cambia el suyo.
 */
export class BusinessRepository {
  constructor(readonly businessId: string) {}

  async get(): Promise<BusinessRecord> {
    return prisma.business.findUniqueOrThrow({ where: { id: this.businessId }, select: selection });
  }

  async save(fields: BusinessSettingsDto): Promise<BusinessRecord> {
    return prisma.business.update({
      where: { id: this.businessId },
      data: fields,
      select: selection,
    });
  }

  async findLogo(): Promise<BusinessLogo | null> {
    const row = await prisma.business.findUnique({
      where: { id: this.businessId },
      select: { logoData: true, logoMimeType: true },
    });

    return row?.logoData == null || row.logoMimeType === null
      ? null
      : { data: row.logoData, mimeType: row.logoMimeType as ImageMimeType };
  }

  /** Guarda o reemplaza el logo (imagen y tipo siempre juntos: lo exige un CHECK). */
  async saveLogo(logo: BusinessLogo): Promise<BusinessRecord> {
    return prisma.business.update({
      where: { id: this.businessId },
      data: {
        logoData: Buffer.from(logo.data),
        logoMimeType: logo.mimeType,
        logoUpdatedAt: new Date(),
      },
      select: selection,
    });
  }

  async removeLogo(): Promise<BusinessRecord> {
    return prisma.business.update({
      where: { id: this.businessId },
      data: { logoData: null, logoMimeType: null, logoUpdatedAt: null },
      select: selection,
    });
  }
}
