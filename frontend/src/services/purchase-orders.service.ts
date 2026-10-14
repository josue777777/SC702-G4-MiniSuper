import type {
  PurchaseOrder,
  PurchaseOrderPayload,
  PurchaseOrderSummary,
} from '../types/purchase-orders';
import { apiGet, apiPost } from './api-client';

/** Service de pedidos a proveedor (HU-22, HU-24): único punto que conoce las rutas de la API. */
interface DataResponse<T> {
  data: T;
}

export const purchaseOrdersService = {
  /** HU-22: historial, del más reciente al más antiguo; opcionalmente de un solo proveedor. */
  async list(supplierId?: string): Promise<PurchaseOrderSummary[]> {
    const query = supplierId === undefined ? '' : `?supplierId=${encodeURIComponent(supplierId)}`;
    const response = await apiGet<DataResponse<PurchaseOrderSummary[]>>(
      `/api/purchase-orders${query}`,
    );

    return response.data;
  },

  /** HU-22: detalle completo de un pedido. */
  async get(id: string): Promise<PurchaseOrder> {
    const response = await apiGet<DataResponse<PurchaseOrder>>(`/api/purchase-orders/${id}`);

    return response.data;
  },

  /** HU-24: registrar el pedido. Queda guardado en el historial como pendiente. */
  async create(payload: PurchaseOrderPayload): Promise<PurchaseOrder> {
    const response = await apiPost<DataResponse<PurchaseOrder>>('/api/purchase-orders', payload);

    return response.data;
  },
};
