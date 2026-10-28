import type { LoginPayload, Profile, ProfileUpdatePayload } from '../types/auth';
import { apiGet, apiPatch, apiPost, apiRequest } from './api-client';

interface DataResponse<T> {
  data: T;
}

export const authService = {
  /** Abre la sesión (la cookie la guarda el navegador, el JavaScript no la ve). */
  async login(payload: LoginPayload): Promise<Profile> {
    return (await apiPost<DataResponse<Profile>>('/api/auth/login', payload)).data;
  },

  /** Usuario de la sesión actual, con su rol y permisos. 401 si no hay sesión o ya se cerró. */
  async getSession(): Promise<Profile> {
    return (await apiGet<DataResponse<Profile>>('/api/auth/session')).data;
  },

  /** HU-15: invalida la sesión en el servidor y borra la cookie. */
  async logout(): Promise<void> {
    await apiRequest<null>('/api/auth/logout', { method: 'POST' });
  },
};

export const profileService = {
  /** HU-14: datos actuales del usuario. 401 si no hay sesión. */
  async get(): Promise<Profile> {
    return (await apiGet<DataResponse<Profile>>('/api/profile')).data;
  },

  /** HU-14: actualiza nombre, correo y/o contraseña. */
  async update(payload: ProfileUpdatePayload): Promise<Profile> {
    return (await apiPatch<DataResponse<Profile>>('/api/profile', payload)).data;
  },
};
