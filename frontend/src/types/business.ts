/** Datos del negocio (Configuración › General). Reflejan backend/src/types/business.ts. */
export interface BusinessSettings {
  name: string;
  legalId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  receiptMessage: string | null;
}

/** Plan contratado: el Encargado más sus usuarios adicionales. */
export interface BusinessPlan {
  extraUsers: number;
  maxUsers: number;
  usedSeats: number;
}

export interface Business extends BusinessSettings {
  /** Ruta del logo en la API (con `?v=`), o `null` si no hay. */
  logoUrl: string | null;
  plan: BusinessPlan;
}
