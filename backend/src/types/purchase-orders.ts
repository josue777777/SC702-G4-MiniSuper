/**
 * Contratos del módulo de pedidos a proveedor (HU-22, HU-24).
 *
 * El dinero viaja como cadena con dos decimales (`"1500.00"`), igual que en
 * productos y proveedores.
 */
import type { MoneyString } from './products.js';

/** Estados del pedido: los mismos literales del enum `PurchaseOrderStatus` de Prisma. */
export type PurchaseOrderStatus = 'PENDING' | 'RECEIVED';

/** Línea de un pedido: producto, cantidad y costo al que se le compra a ese proveedor. */
export interface PurchaseOrderItemDto {
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitCost: MoneyString;
  /** `quantity * unitCost`. */
  subtotal: MoneyString;
}

/** Fila del historial de pedidos (HU-22). */
export interface PurchaseOrderSummaryDto {
  id: string;
  supplierId: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  total: MoneyString;
  itemCount: number;
  /** Fecha y hora del pedido, ISO 8601. */
  createdAt: string;
}

/** Detalle completo de un pedido: lo que muestra el historial y lo que lleva el PDF (HU-24). */
export interface PurchaseOrderDto extends PurchaseOrderSummaryDto {
  supplierPhone: string | null;
  supplierEmail: string | null;
  notes: string | null;
  items: PurchaseOrderItemDto[];
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
