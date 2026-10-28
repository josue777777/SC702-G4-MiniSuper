import type { ImageMimeType } from '../utils/image.js';

/** Datos del negocio que se editan en Configuración › General. */
export interface BusinessSettingsDto {
  name: string;
  legalId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  receiptMessage: string | null;
}

/** Plan contratado: cuántos usuarios activos permite y cuántos están en uso. */
export interface BusinessPlanDto {
  maxUsers: number;
  usedSeats: number;
}

/** Lo que devuelve `GET /api/business`. */
export interface BusinessDto extends BusinessSettingsDto {
  /** URL del logo con `?v=` (cambia con cada logo nuevo), o `null` si no hay. */
  logoUrl: string | null;
  plan: BusinessPlanDto;
}

/** Lo único que se muestra antes de iniciar sesión (pantalla de login). */
export interface PublicBusinessDto {
  name: string;
  logoUrl: string | null;
}

/** Fila guardada, tal como la lee el repositorio. */
export interface BusinessRecord extends BusinessSettingsDto {
  maxUsers: number;
  logoUpdatedAt: Date | null;
}

export interface BusinessLogo {
  data: Uint8Array;
  mimeType: ImageMimeType;
}
