import type { LabelDesign } from '../types/labels';
import { apiGet, apiRequest } from './api-client';

/**
 * Service del diseño de etiquetas (HU-07): el único punto por el que la pantalla
 * habla con `/api/business/label-design`.
 */
interface DataResponse<T> {
  data: T;
}

export const labelsService = {
  /** Diseño del negocio; si nunca se guardó, el servidor devuelve el de fábrica. */
  async getDesign(): Promise<LabelDesign> {
    return (await apiGet<DataResponse<LabelDesign>>('/api/business/label-design')).data;
  },

  /** Guarda el diseño para todo el negocio. Solo el Encargado (los demás reciben 403). */
  async saveDesign(design: LabelDesign): Promise<LabelDesign> {
    return (
      await apiRequest<DataResponse<LabelDesign>>('/api/business/label-design', {
        method: 'PUT',
        body: JSON.stringify(design),
      })
    ).data;
  },
};
