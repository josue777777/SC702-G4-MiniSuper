import { prisma } from '../config/prisma.js';
import type { BusinessSettingsDto } from '../types/business.js';

/** La tabla tiene una sola fila, siempre con este id (lo exige un CHECK en la base). */
const SINGLE_ROW_ID = 1;

/** Valores de una instalación nueva; la migración crea la fila con estos mismos datos. */
export const DEFAULT_BUSINESS: BusinessSettingsDto = {
  name: 'Abastecedor Nuevo Amanecer',
  legalId: null,
  phone: null,
  email: null,
  address: null,
  receiptMessage: '¡Gracias por su compra!',
};

const selection = {
  name: true,
  legalId: true,
  phone: true,
  email: true,
  address: true,
  receiptMessage: true,
} as const;

/** Capa de acceso a datos de la configuración del negocio. */
export class BusinessRepository {
  /** Los datos guardados, o los de fábrica si la fila aún no existe. */
  async get(): Promise<BusinessSettingsDto> {
    return (
      (await prisma.businessSettings.findUnique({
        where: { id: SINGLE_ROW_ID },
        select: selection,
      })) ?? DEFAULT_BUSINESS
    );
  }

  /** Guarda los datos completos; crea la fila si no existiera. */
  async save(fields: BusinessSettingsDto): Promise<BusinessSettingsDto> {
    return prisma.businessSettings.upsert({
      where: { id: SINGLE_ROW_ID },
      create: { id: SINGLE_ROW_ID, ...fields },
      update: fields,
      select: selection,
    });
  }
}
