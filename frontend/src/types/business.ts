/** Datos del negocio (Configuración › General). Reflejan backend/src/types/business.ts. */
export interface BusinessSettings {
  name: string;
  legalId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  receiptMessage: string | null;
}

/** Plan contratado: cuántos usuarios activos permite y cuántos están en uso. */
export interface BusinessPlan {
  maxUsers: number;
  usedSeats: number;
}

export interface Business extends BusinessSettings {
  /** Ruta del logo en la API (con `?v=`), o `null` si no hay. */
  logoUrl: string | null;
  plan: BusinessPlan;
}

/** Lo que se ve antes de iniciar sesión. */
export interface PublicBusiness {
  name: string;
  logoUrl: string | null;
}
