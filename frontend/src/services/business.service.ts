import { API_BASE_URL } from '../config/env';
import type { Business, BusinessSettings, PublicBusiness } from '../types/business';
import { apiGet, apiRequest } from './api-client';

interface DataResponse<T> {
  data: T;
}

function put<T>(path: string, body: unknown): Promise<DataResponse<T>> {
  return apiRequest<DataResponse<T>>(path, { method: 'PUT', body: JSON.stringify(body) });
}

export const businessService = {
  /** Datos, logo y plan del negocio (cualquier usuario con sesión). */
  async get(): Promise<Business> {
    return (await apiGet<DataResponse<Business>>('/api/business')).data;
  },

  /** Nombre y logo, sin sesión: para la pantalla de login. */
  async getPublic(): Promise<PublicBusiness> {
    return (await apiGet<DataResponse<PublicBusiness>>('/api/business/public')).data;
  },

  /** Datos del negocio. Administrador y Encargado (la API responde 403 a los demás). */
  async update(settings: BusinessSettings): Promise<Business> {
    return (await put<Business>('/api/business', settings)).data;
  },

  /** Límite de usuarios del plan. Solo el Administrador. */
  async updatePlan(maxUsers: number): Promise<Business> {
    return (await put<Business>('/api/business/plan', { maxUsers })).data;
  },

  /** Sube o reemplaza el logo (PNG, JPG o WEBP de hasta 1 MB). */
  async uploadLogo(file: File): Promise<Business> {
    return (
      await apiRequest<DataResponse<Business>>('/api/business/logo', {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
    ).data;
  },

  async removeLogo(): Promise<Business> {
    return (await apiRequest<DataResponse<Business>>('/api/business/logo', { method: 'DELETE' }))
      .data;
  },

  /** URL completa para `<img src>`. */
  logoSrc(logoUrl: string): string {
    return `${API_BASE_URL}${logoUrl}`;
  },
};
