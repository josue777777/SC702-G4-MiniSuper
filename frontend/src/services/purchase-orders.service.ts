import type {
  PurchaseOrder,
  PurchaseOrderPayload,
  PurchaseOrderSummary,
  ReceiveOrderPayload,
} from '../types/purchase-orders';
import { apiDownload, apiGet, apiPost, apiRequest } from './api-client';

/**
 * Service de pedidos a proveedor (HU-22, HU-24) y sus entregas (HU-38): único
 * punto que conoce las rutas de la API.
 */
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

  /** HU-38: registrar una entrega con su factura; con `loadNow`, también sube el stock. */
  async receive(id: string, payload: ReceiveOrderPayload): Promise<PurchaseOrder> {
    const response = await apiPost<DataResponse<PurchaseOrder>>(
      `/api/purchase-orders/${id}/receipts`,
      payload,
    );

    return response.data;
  },

  /** HU-38: cargar al inventario una entrega que quedó pendiente. */
  async loadReceipt(id: string, receiptId: string): Promise<PurchaseOrder> {
    const response = await apiPost<DataResponse<PurchaseOrder>>(
      `/api/purchase-orders/${id}/receipts/${receiptId}/load`,
      {},
    );

    return response.data;
  },

  /**
   * HU-38: adjunta (o reemplaza) la factura del proveedor de una entrega. El
   * cuerpo son los bytes del archivo; el nombre va en `X-File-Name`.
   */
  async attachInvoice(id: string, receiptId: string, file: File): Promise<PurchaseOrder> {
    const response = await apiRequest<DataResponse<PurchaseOrder>>(
      `/api/purchase-orders/${id}/receipts/${receiptId}/invoice`,
      {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name) },
      },
    );

    return response.data;
  },

  /** HU-38: la factura adjunta, como archivo, para verla en pantalla o descargarla. */
  async invoiceFile(id: string, receiptId: string): Promise<Blob> {
    return (
      await apiDownload(`/api/purchase-orders/${id}/receipts/${receiptId}/invoice`, 'factura')
    ).blob;
  },

  /** HU-38: dar por concluido un pedido que llegó en parte. */
  async close(id: string): Promise<PurchaseOrder> {
    const response = await apiPost<DataResponse<PurchaseOrder>>(
      `/api/purchase-orders/${id}/close`,
      {},
    );

    return response.data;
  },
};
