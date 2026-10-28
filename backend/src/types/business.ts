import type { ImageMimeType } from '../utils/image.js';

/** Datos del negocio que su Encargado edita en Configuración › General. */
export interface BusinessSettingsDto {
  name: string;
  legalId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  receiptMessage: string | null;
}

/** Plan contratado: el Encargado más `extraUsers` adicionales. */
export interface BusinessPlanDto {
  extraUsers: number;
  /** 1 (el Encargado) + adicionales. */
  maxUsers: number;
  usedSeats: number;
}

/** Lo que devuelve `GET /api/business`: el negocio de la sesión. */
export interface BusinessDto extends BusinessSettingsDto {
  /** URL del logo con `?v=` (cambia con cada logo nuevo), o `null` si no hay. */
  logoUrl: string | null;
  plan: BusinessPlanDto;
}

/** Fila guardada, tal como la lee el repositorio. */
export interface BusinessRecord extends BusinessSettingsDto {
  id: string;
  extraUsers: number;
  status: 'ACTIVE' | 'SUSPENDED';
  logoUpdatedAt: Date | null;
}

export interface BusinessLogo {
  data: Uint8Array;
  mimeType: ImageMimeType;
}
