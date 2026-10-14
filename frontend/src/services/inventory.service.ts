import type {
  ExpirationAlert,
  InventoryCount,
  InventoryCountPayload,
  LowStockAlert,
  ProductStockSettings,
} from '../types/inventory';
import { apiGet, apiPatch, apiPost } from './api-client';

/**
 * Service de inventario (HU-08, HU-09, HU-10). Es el único punto por el que la pantalla de
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

  /** HU-08: productos con stock igual o menor a su mínimo. */
  async listLowStock(): Promise<LowStockAlert[]> {
    const response = await apiGet<DataResponse<LowStockAlert[]>>('/api/inventory/low-stock');

    return response.data;
  },

  /** HU-10: confirma un conteo físico. Un negativo responde 400. */
  async createCount(payload: InventoryCountPayload): Promise<InventoryCount> {
    const response = await apiPost<DataResponse<InventoryCount>>('/api/inventory/counts', payload);

    return response.data;
  },

  /** Mínimo y vencimiento de los productos activos (HU-08, HU-09). */
  async listProductSettings(): Promise<ProductStockSettings[]> {
    const response = await apiGet<DataResponse<ProductStockSettings[]>>('/api/inventory/products');

    return response.data;
  },

  /** HU-08: define el mínimo de stock (0 = sin mínimo). */
  async updateMinStock(productId: string, minStock: number): Promise<ProductStockSettings> {
    const response = await apiPatch<DataResponse<ProductStockSettings>>(
      `/api/inventory/products/${productId}/min-stock`,
      { minStock },
    );

    return response.data;
  },

  /** HU-09: guarda la fecha de vencimiento, o la quita con `null`. */
  async updateExpirationDate(
    productId: string,
    expirationDate: string | null,
  ): Promise<ProductStockSettings> {
    const response = await apiPatch<DataResponse<ProductStockSettings>>(
      `/api/inventory/products/${productId}/expiration-date`,
      { expirationDate },
    );

    return response.data;
  },

  /** HU-09: productos vencidos y próximos a vencer, del más urgente al menos urgente. */
  async listExpirations(): Promise<ExpirationAlert[]> {
    const response = await apiGet<DataResponse<ExpirationAlert[]>>('/api/inventory/expirations');

    return response.data;
  },
};
