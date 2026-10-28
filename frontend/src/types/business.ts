/** Datos del negocio (Configuración › General). Reflejan backend/src/types/business.ts. */
export interface BusinessSettings {
  name: string;
  legalId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  receiptMessage: string | null;
}
