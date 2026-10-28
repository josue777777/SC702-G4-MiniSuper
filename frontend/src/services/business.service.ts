import type { BusinessSettings } from '../types/business';
import { apiGet, apiRequest } from './api-client';

interface DataResponse<T> {
  data: T;
}

export const businessService = {
  /** Datos completos del negocio (cualquier usuario con sesión). */
  async get(): Promise<BusinessSettings> {
    return (await apiGet<DataResponse<BusinessSettings>>('/api/business')).data;
  },

  /** Solo el nombre, sin sesión: para la pantalla de login. */
  async getPublicName(): Promise<string> {
    return (await apiGet<DataResponse<{ name: string }>>('/api/business/public')).data.name;
  },

  /** Guarda los datos completos. Solo el Administrador (la API responde 403 a los demás). */
  async update(settings: BusinessSettings): Promise<BusinessSettings> {
    return (
      await apiRequest<DataResponse<BusinessSettings>>('/api/business', {
        method: 'PUT',
        body: JSON.stringify(settings),
      })
    ).data;
  },
};
