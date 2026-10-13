import type { Category, CategoryPayload } from '../types/categories';
import { apiGet, apiPost } from './api-client';

interface DataResponse<T> {
  data: T;
}

export const categoriesService = {
  /** HU-04: categorías existentes (activas e inactivas). */
  async list(): Promise<Category[]> {
    const response = await apiGet<DataResponse<Category[]>>('/api/categories');

    return response.data;
  },

  /** HU-04: crea una categoría. El nombre duplicado responde 409. */
  async create(payload: CategoryPayload): Promise<Category> {
    const response = await apiPost<DataResponse<Category>>('/api/categories', payload);

    return response.data;
  },
};
