import type {
  CreateUserPayload,
  UpdateUserPayload,
  UserListItem,
  UserWithTemporaryPassword,
} from '../types/auth';
import { apiGet, apiPatch, apiPost } from './api-client';

interface DataResponse<T> {
  data: T;
}

/** Configuración › Usuarios. La API responde 403 a cualquier rol que no sea Administrador. */
export const usersService = {
  /** HU-12: usuario libre sugerido para un nombre (`jnavarro`, `jnavarro2`…). */
  async suggestUsername(name: string): Promise<string> {
    const query = new URLSearchParams({ name });

    return (
      await apiGet<DataResponse<{ username: string }>>(`/api/users/username-suggestion?${query}`)
    ).data.username;
  },

  async list(): Promise<UserListItem[]> {
    return (await apiGet<DataResponse<UserListItem[]>>('/api/users')).data;
  },

  /** La contraseña temporal la genera el servidor y viene en la respuesta. */
  async create(payload: CreateUserPayload): Promise<UserWithTemporaryPassword> {
    return (await apiPost<DataResponse<UserWithTemporaryPassword>>('/api/users', payload)).data;
  },

  async update(id: string, payload: UpdateUserPayload): Promise<UserListItem> {
    return (await apiPatch<DataResponse<UserListItem>>(`/api/users/${id}`, payload)).data;
  },

  async deactivate(id: string): Promise<UserListItem> {
    return (await apiPost<DataResponse<UserListItem>>(`/api/users/${id}/deactivate`, {})).data;
  },

  async activate(id: string): Promise<UserListItem> {
    return (await apiPost<DataResponse<UserListItem>>(`/api/users/${id}/activate`, {})).data;
  },

  /** HU-13: contraseña temporal nueva; el usuario debe cambiarla al entrar. */
  async resetPassword(id: string): Promise<UserWithTemporaryPassword> {
    return (
      await apiPost<DataResponse<UserWithTemporaryPassword>>(`/api/users/${id}/reset-password`, {})
    ).data;
  },
};
