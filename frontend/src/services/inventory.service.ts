import type { InventoryCount, InventoryCountPayload } from '../types/inventory';
import { apiGet, apiPost } from './api-client';

/**
 * Service de inventario (HU-10). Es el único punto por el que la pantalla de
 * inventario habla con la API; desenvuelve `data` una sola vez.
 */
interface DataResponse<T> {
  data: T;
}

export const inventoryService = {
  /** Historial de conteos físicos, del más reciente al más antiguo. */
  async listCounts(): Promise<InventoryCount[]> {
    const response = await apiGet<DataResponse<InventoryCount[]>>('/api/inventory/counts');

    return response.data;
  },

  /** HU-10: confirma un conteo físico. Un negativo responde 400. */
  async createCount(payload: InventoryCountPayload): Promise<InventoryCount> {
    const response = await apiPost<DataResponse<InventoryCount>>('/api/inventory/counts', payload);

    return response.data;
  },
};
