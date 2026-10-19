import type {
  LoginPayload,
  Profile,
  ProfileUpdatePayload,
  SetupPayload,
  SetupStatus,
} from '../types/auth';
import { apiGet, apiPatch, apiPost } from './api-client';

interface DataResponse<T> {
  data: T;
}

export const authService = {
  /** HU-12: ¿ya existe la cuenta del dueño? */
  async getSetupStatus(): Promise<SetupStatus> {
    return (await apiGet<DataResponse<SetupStatus>>('/api/auth/setup-status')).data;
  },

  /** HU-12: crea la cuenta única. Responde 409 si ya existe. */
  async setup(payload: SetupPayload): Promise<Profile> {
    return (await apiPost<DataResponse<Profile>>('/api/auth/setup', payload)).data;
  },

  /** Abre la sesión (la cookie la guarda el navegador, el JavaScript no la ve). */
  async login(payload: LoginPayload): Promise<Profile> {
    return (await apiPost<DataResponse<Profile>>('/api/auth/login', payload)).data;
  },
};

export const profileService = {
  /** HU-14: datos actuales del dueño. 401 si no hay sesión. */
  async get(): Promise<Profile> {
    return (await apiGet<DataResponse<Profile>>('/api/profile')).data;
  },

  /** HU-14: actualiza nombre, correo y/o contraseña. */
  async update(payload: ProfileUpdatePayload): Promise<Profile> {
    return (await apiPatch<DataResponse<Profile>>('/api/profile', payload)).data;
  },
};
