/**
 * Contratos del módulo de pedidos a proveedor (HU-22, HU-24) y de sus
 * recepciones con factura (HU-38).
 *
 * El dinero viaja como cadena con dos decimales (`"1500.00"`), igual que en
 * productos y proveedores.
 */
import type { MoneyString } from './products.js';

/**
 * Estados del pedido: los mismos literales del enum `PurchaseOrderStatus` de
 * Prisma. `PARTIAL`: llegó una parte y el pedido sigue abierto; `RECEIVED`:
 * llegó todo o se dio por concluido.
 */
export type PurchaseOrderStatus = 'PENDING' | 'PARTIAL' | 'RECEIVED';

/** Línea de un pedido: producto, cantidad y costo al que se le compra a ese proveedor. */
export interface PurchaseOrderItemDto {
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitCost: MoneyString;
  /** `quantity * unitCost`. */
  subtotal: MoneyString;
  /** Suma de lo recibido en todas las entregas (HU-38). */
  receivedQuantity: number;
  /** Lo que falta por llegar: `quantity - receivedQuantity` (nunca negativo). */
  pendingQuantity: number;
  /** ¿Vence? Si es `true`, al recibirlo se pide lote y fecha de vencimiento (HU-38). */
  perishable: boolean;
}

/**
 * Un lote de lo que llegó (HU-38): número, vencimiento y unidades. La
 * fecha es `YYYY-MM-DD`, o `null` si el producto no vence.
 */
export interface ReceiptLotFields {
  lotNumber: string;
  expirationDate: string | null;
  quantity: number;
}

/** Cuánto llegó de un producto en una entrega, partido en sus lotes. */
export interface PurchaseReceiptItemDto {
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  lots: ReceiptLotFields[];
}

/** Una entrega del proveedor con su factura (HU-38). */
export interface PurchaseReceiptDto {
  id: string;
  invoiceNumber: string;
  /** Día en que llegó la mercadería, `YYYY-MM-DD`. */
  receivedOn: string;
  /** Cuándo se cargó al inventario (ISO 8601); `null` = carga pendiente. */
  loadedAt: string | null;
  createdAt: string;
  items: PurchaseReceiptItemDto[];
  /** La factura del proveedor adjunta (sin los bytes), o `null` si no tiene. */
  invoiceFile: { name: string; mimeType: string; uploadedAt: string } | null;
}

/** Factura adjunta ya validada: bytes, tipo y nombre. */
export interface ReceiptInvoiceFile {
  data: Uint8Array;
  mimeType: string;
  name: string;
}

/** Fila del historial de pedidos (HU-22). */
export interface PurchaseOrderSummaryDto {
  id: string;
  /** Consecutivo para las personas: el frontend lo muestra como PED-0007. */
  number: number;
  supplierId: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  total: MoneyString;
  itemCount: number;
  /** Nombres de los productos del pedido, en orden alfabético. */
  productNames: string[];
  /** Fecha y hora del pedido, ISO 8601. */
  createdAt: string;
  /** Día en que se completó o se dio por concluido (`YYYY-MM-DD`), o `null`. */
  receivedOn: string | null;
  /** Entregas registradas que todavía no se cargaron al inventario. */
  pendingLoads: number;
  /** Números de factura de sus entregas (para buscar el pedido por factura). */
  invoiceNumbers: string[];
}

/** Detalle completo de un pedido: lo que muestra el historial y lo que lleva el PDF (HU-24). */
export interface PurchaseOrderDto extends PurchaseOrderSummaryDto {
  supplierPhone: string | null;
  supplierEmail: string | null;
  notes: string | null;
  items: PurchaseOrderItemDto[];
  /** Entregas, de la más reciente a la más antigua. */
  receipts: PurchaseReceiptDto[];
}

/** Lo que envía el formulario: el proveedor, notas y los productos con su cantidad. */
export interface PurchaseOrderFields {
  supplierId: string;
  notes: string | null;
  items: { productId: string; quantity: number }[];
}

/** Producto que suministra un proveedor, con el costo acordado (de `SupplierProduct`). */
export interface SupplierCatalogItem {
  productId: string;
  productName: string;
  unitCost: MoneyString;
}

/** Proveedor activo y su catálogo, para armar el pedido. */
export interface SupplierCatalog {
  supplierId: string;
  products: SupplierCatalogItem[];
}

/** Cantidad y costo unitario de una línea, para calcular totales. */
export interface MoneyLine {
  quantity: number;
  unitCost: MoneyString;
}

/** Trabajo que el service encarga al repositorio al crear un pedido. */
export interface CreatePurchaseOrderPlan {
  supplierId: string;
  notes: string | null;
  total: MoneyString;
  items: { productId: string; quantity: number; unitCost: MoneyString }[];
}

/** Lo que envía el formulario de recepción (HU-38). */
export interface ReceiveOrderFields {
  invoiceNumber: string;
  /** `YYYY-MM-DD`: el día en que llegó, no el día en que se registra. */
  receivedOn: string;
  /** `true`: cargar ya al inventario; `false`: dejar la carga pendiente. */
  loadNow: boolean;
  /**
   * Lo que llegó de cada producto; 0 = no llegó en esta entrega. `lots`: cómo
   * vino partido; la suma de los lotes es `quantity`. Un producto que no vence
   * puede omitirlos: el lote es entonces el número de factura.
   */
  items: { productId: string; quantity: number; lots?: ReceiptLotFields[] | undefined }[];
}

/** Trabajo que el service encarga al repositorio al registrar una entrega. */
export interface ReceiveOrderPlan {
  invoiceNumber: string;
  receivedOn: string;
  loadNow: boolean;
  /**
   * Solo las líneas con cantidad > 0, ya comprobadas contra lo pendiente, con
   * sus lotes ya resueltos (`resolveReceiptLots`).
   */
  items: { productId: string; quantity: number; lots: ReceiptLotFields[] }[];
  /** Motivo de los movimientos de entrada, p. ej. «Recepción PED-0007 · Factura F-12». */
  reason: string;
}
