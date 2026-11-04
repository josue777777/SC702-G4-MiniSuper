import type {
  BusinessSummary,
  BusinessWithManager,
  CreateBusinessPayload,
  OwnPlanRequests,
  PlanRequest,
  PlanRequestStatus,
  PlatformSettings,
} from '../types/platform';
import { apiGet, apiPatch, apiPost, apiRequest } from './api-client';

interface DataResponse<T> {
  data: T;
}

/** La plataforma: solo el Administrador (la API responde 403 a los demás). */
export const platformService = {
  /** Nombre del sistema, sin sesión (pantalla de login). */
  async getSystemName(): Promise<string> {
    return (await apiGet<DataResponse<{ systemName: string }>>('/api/platform/public')).data
      .systemName;
  },

  async getSettings(): Promise<PlatformSettings> {
    return (await apiGet<DataResponse<PlatformSettings>>('/api/platform/settings')).data;
  },

  async updateSettings(settings: PlatformSettings): Promise<PlatformSettings> {
    return (
      await apiRequest<DataResponse<PlatformSettings>>('/api/platform/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      })
    ).data;
  },

  async listBusinesses(): Promise<BusinessSummary[]> {
    return (await apiGet<DataResponse<BusinessSummary[]>>('/api/platform/businesses')).data;
  },

  /** Crea el negocio con su Encargado; trae la contraseña temporal (una sola vez). */
  async createBusiness(payload: CreateBusinessPayload): Promise<BusinessWithManager> {
    return (await apiPost<DataResponse<BusinessWithManager>>('/api/platform/businesses', payload))
      .data;
  },

  async setPlan(id: string, extraUsers: number): Promise<BusinessSummary> {
    return (
      await apiPatch<DataResponse<BusinessSummary>>(`/api/platform/businesses/${id}/plan`, {
        extraUsers,
      })
    ).data;
  },

  async setSuspended(id: string, suspended: boolean): Promise<BusinessSummary> {
    const action = suspended ? 'suspend' : 'activate';

    return (
      await apiPost<DataResponse<BusinessSummary>>(`/api/platform/businesses/${id}/${action}`, {})
    ).data;
  },

  async listRequests(status?: PlanRequestStatus): Promise<PlanRequest[]> {
    const query = status === undefined ? '' : `?status=${status}`;

    return (await apiGet<DataResponse<PlanRequest[]>>(`/api/platform/requests${query}`)).data;
  },

  async decide(
    id: string,
    decision: 'approve' | 'reject',
    response: string | null,
  ): Promise<PlanRequest> {
    return (
      await apiPost<DataResponse<PlanRequest>>(`/api/platform/requests/${id}/${decision}`, {
        response,
      })
    ).data;
  },
};

/** Solicitudes de ampliación del Encargado (las de su negocio). */
export const planRequestsService = {
  async listOwn(): Promise<OwnPlanRequests> {
    return (await apiGet<DataResponse<OwnPlanRequests>>('/api/plan-requests')).data;
  },

  async create(extraUsers: number, note: string | null): Promise<PlanRequest> {
    return (await apiPost<DataResponse<PlanRequest>>('/api/plan-requests', { extraUsers, note }))
      .data;
  },
};
