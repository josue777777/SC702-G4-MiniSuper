/** Datos del negocio (Configuración › General). */
export interface BusinessSettingsDto {
  name: string;
  legalId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  receiptMessage: string | null;
}

/** Lo único que se muestra antes de iniciar sesión (pantalla de login). */
export interface PublicBusinessDto {
  name: string;
}
