/** Contratos de la plataforma: negocios clientes, planes y solicitudes (ADR 0002). */

export type BusinessStatus = 'ACTIVE' | 'SUSPENDED';
export type PlanRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface PlatformSettingsDto {
  /** Nombre del sistema que ven todos (lo cambia solo el Administrador). */
  systemName: string;
  /** Precio mensual de cada usuario adicional. */
  pricePerExtraUser: string;
}

/** Lo que se ve antes de iniciar sesión. */
export interface PublicPlatformDto {
  systemName: string;
}

/**
 * Un negocio visto desde la plataforma: lo necesario para administrarlo
 * (plan, uso, estado, su Encargado), NUNCA sus datos internos (ventas,
 * productos, clientes).
 */
export interface BusinessSummaryDto {
  id: string;
  name: string;
  status: BusinessStatus;
  extraUsers: number;
  maxUsers: number;
  usedSeats: number;
  manager: { id: string; name: string; email: string } | null;
  pendingRequest: boolean;
  createdAt: string;
}

export interface PlanRequestDto {
  id: string;
  businessId: string;
  businessName: string;
  requestedBy: string;
  extraUsers: number;
  monthlyAmount: string;
  note: string | null;
  status: PlanRequestStatus;
  response: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/** Alta de un negocio con su Encargado (la contraseña ya viene con hash). */
export interface CreateBusinessFields {
  businessName: string;
  extraUsers: number;
  manager: { name: string; email: string; passwordHash: string };
}

export interface CreatedBusiness {
  business: BusinessSummaryDto;
  manager: { id: string; name: string; email: string };
}

export interface CreatePlanRequestFields {
  businessId: string;
  requestedById: string;
  extraUsers: number;
  monthlyAmount: string;
  note: string | null;
}
