import type { Preferences } from '../types/preferences';
import { apiGet, apiRequest } from './api-client';

interface DataResponse<T> {
  data: T;
}

/** La apariencia del usuario de la sesión: cada uno solo ve y cambia la suya. */
export const preferencesService = {
  async get(): Promise<Preferences> {
    return (await apiGet<DataResponse<Preferences>>('/api/profile/preferences')).data;
  },

  async update(preferences: Preferences): Promise<Preferences> {
    return (
      await apiRequest<DataResponse<Preferences>>('/api/profile/preferences', {
        method: 'PUT',
        body: JSON.stringify(preferences),
      })
    ).data;
  },
};
