/**
 * Contratos del módulo de pedidos a proveedor en el frontend (HU-22, HU-24).
 * Copia de `backend/src/types/purchase-orders.ts`; el dinero viaja como cadena
 * (`"1500.00"`).
 */

export type PurchaseOrderStatus = 'PENDING' | 'RECEIVED';

export interface PurchaseOrderItem {
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitCost: string;
  /** `quantity * unitCost`. */
  subtotal: string;
}

/** Fila del historial de pedidos (HU-22). */
export interface PurchaseOrderSummary {
  id: string;
  /** Consecutivo para las personas; se muestra como PED-0007. */
  number: number;
  supplierId: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  total: string;
  itemCount: number;
  /** Nombres de los productos del pedido, en orden alfabético. */
  productNames: string[];
  /** Fecha y hora del pedido, ISO 8601. */
  createdAt: string;
}

/** Detalle completo: lo que muestra el historial y lo que lleva el PDF (HU-24). */
export interface PurchaseOrder extends PurchaseOrderSummary {
  supplierPhone: string | null;
  supplierEmail: string | null;
  notes: string | null;
  items: PurchaseOrderItem[];
}

/** Cuerpo que acepta la API al registrar un pedido. El costo lo pone el backend. */
export interface PurchaseOrderPayload {
  supplierId: string;
  notes: string | null;
  items: { productId: string; quantity: number }[];
}
