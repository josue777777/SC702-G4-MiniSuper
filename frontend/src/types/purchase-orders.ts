/**
 * Contratos del módulo de pedidos a proveedor en el frontend (HU-22, HU-24) y
 * de sus entregas con factura (HU-38).
 * Copia de `backend/src/types/purchase-orders.ts`; el dinero viaja como cadena
 * (`"1500.00"`).
 */

/** `PARTIAL`: llegó una parte y sigue abierto; `RECEIVED`: llegó todo o se concluyó. */
export type PurchaseOrderStatus = 'PENDING' | 'PARTIAL' | 'RECEIVED';

export interface PurchaseOrderItem {
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitCost: string;
  /** `quantity * unitCost`. */
  subtotal: string;
  /** Suma de lo recibido en todas las entregas (HU-38). */
  receivedQuantity: number;
  /** Lo que falta por llegar. */
  pendingQuantity: number;
}

/** Una entrega del proveedor con su factura (HU-38). */
export interface PurchaseReceipt {
  id: string;
  invoiceNumber: string;
  /** Día en que llegó, `YYYY-MM-DD`. */
  receivedOn: string;
  /** Cuándo se cargó al inventario; `null` = carga pendiente. */
  loadedAt: string | null;
  createdAt: string;
  items: { productId: string; productCode: string; productName: string; quantity: number }[];
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
  /** Día en que se completó o se concluyó (`YYYY-MM-DD`), o `null`. */
  receivedOn: string | null;
  /** Entregas que todavía no se cargaron al inventario. */
  pendingLoads: number;
}

/** Detalle completo: lo que muestra el historial y lo que lleva el PDF (HU-24). */
export interface PurchaseOrder extends PurchaseOrderSummary {
  supplierPhone: string | null;
  supplierEmail: string | null;
  notes: string | null;
  items: PurchaseOrderItem[];
  /** Entregas, de la más reciente a la más antigua. */
  receipts: PurchaseReceipt[];
}

/** Cuerpo que acepta la API al registrar un pedido. El costo lo pone el backend. */
export interface PurchaseOrderPayload {
  supplierId: string;
  notes: string | null;
  items: { productId: string; quantity: number }[];
}

/** Cuerpo que acepta la API al registrar una entrega (HU-38). */
export interface ReceiveOrderPayload {
  invoiceNumber: string;
  /** `YYYY-MM-DD`: el día en que llegó. */
  receivedOn: string;
  /** `true`: cargar ya al inventario; `false`: dejar la carga pendiente. */
  loadNow: boolean;
  /** Lo que llegó de cada producto; 0 = no vino en esta entrega. */
  items: { productId: string; quantity: number }[];
}
