/** Contratos de la plataforma. Reflejan backend/src/types/platform.ts. */

export type BusinessStatus = 'ACTIVE' | 'SUSPENDED';
export type PlanRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface PlatformSettings {
  systemName: string;
  pricePerExtraUser: string;
}

/** Un negocio cliente visto desde la plataforma: su plan y su Encargado, no sus datos internos. */
export interface BusinessSummary {
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

export interface CreateBusinessPayload {
  businessName: string;
  extraUsers: number;
  managerName: string;
  managerEmail: string;
}

export interface BusinessWithManager {
  business: BusinessSummary;
  manager: { id: string; name: string; email: string; temporaryPassword: string };
}

export interface PlanRequest {
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

export interface OwnPlanRequests {
  requests: PlanRequest[];
  pricePerExtraUser: string;
}
