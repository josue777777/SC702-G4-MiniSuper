import { prisma } from '../config/prisma.js';
import type { BusinessLogo, BusinessRecord, BusinessSettingsDto } from '../types/business.js';
import type { ImageMimeType } from '../utils/image.js';

/** La tabla tiene una sola fila, siempre con este id (lo exige un CHECK en la base). */
const SINGLE_ROW_ID = 1;

/** Usuarios del plan inicial (igual que el valor por defecto de la base). */
export const DEFAULT_MAX_USERS = 5;

/** Valores de una instalación nueva; la migración crea la fila con estos mismos datos. */
export const DEFAULT_BUSINESS: BusinessSettingsDto = {
  name: 'Abastecedor Nuevo Amanecer',
  legalId: null,
  phone: null,
  email: null,
  address: null,
  receiptMessage: '¡Gracias por su compra!',
};

/** Todo menos los bytes del logo: esos solo se leen al pedir la imagen. */
const selection = {
  name: true,
  legalId: true,
  phone: true,
  email: true,
  address: true,
  receiptMessage: true,
  maxUsers: true,
  logoUpdatedAt: true,
} as const;

const DEFAULT_RECORD: BusinessRecord = {
  ...DEFAULT_BUSINESS,
  maxUsers: DEFAULT_MAX_USERS,
  logoUpdatedAt: null,
};

/** Capa de acceso a datos de la configuración del negocio (una sola fila). */
export class BusinessRepository {
  /** Los datos guardados, o los de fábrica si la fila aún no existe. */
  async get(): Promise<BusinessRecord> {
    return (
      (await prisma.businessSettings.findUnique({
        where: { id: SINGLE_ROW_ID },
        select: selection,
      })) ?? DEFAULT_RECORD
    );
  }

  /** Guarda los datos editables; crea la fila si no existiera. */
  async save(fields: BusinessSettingsDto): Promise<BusinessRecord> {
    return prisma.businessSettings.upsert({
      where: { id: SINGLE_ROW_ID },
      create: { id: SINGLE_ROW_ID, ...fields },
      update: fields,
      select: selection,
    });
  }

  /** Cambia el límite de usuarios del plan. */
  async setMaxUsers(maxUsers: number): Promise<BusinessRecord> {
    return prisma.businessSettings.upsert({
      where: { id: SINGLE_ROW_ID },
      create: { id: SINGLE_ROW_ID, ...DEFAULT_BUSINESS, maxUsers },
      update: { maxUsers },
      select: selection,
    });
  }

  async findLogo(): Promise<BusinessLogo | null> {
    const row = await prisma.businessSettings.findUnique({
      where: { id: SINGLE_ROW_ID },
      select: { logoData: true, logoMimeType: true },
    });

    return row?.logoData == null || row.logoMimeType === null
      ? null
      : { data: row.logoData, mimeType: row.logoMimeType as ImageMimeType };
  }

  /** Guarda o reemplaza el logo (imagen y tipo siempre juntos: lo exige un CHECK). */
  async saveLogo(logo: BusinessLogo): Promise<BusinessRecord> {
    const fields = {
      logoData: Buffer.from(logo.data),
      logoMimeType: logo.mimeType,
      logoUpdatedAt: new Date(),
    };

    return prisma.businessSettings.upsert({
      where: { id: SINGLE_ROW_ID },
      create: { id: SINGLE_ROW_ID, ...DEFAULT_BUSINESS, ...fields },
      update: fields,
      select: selection,
    });
  }

  async removeLogo(): Promise<BusinessRecord> {
    await prisma.businessSettings.updateMany({
      where: { id: SINGLE_ROW_ID },
      data: { logoData: null, logoMimeType: null, logoUpdatedAt: null },
    });

    return this.get();
  }
}
