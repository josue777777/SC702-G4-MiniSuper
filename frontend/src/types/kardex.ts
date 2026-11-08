import type { UnitOfMeasure } from './products';

/**
 * Contratos del Kardex: ficha e historial de un producto (HU-31). Reflejan
 * backend/src/types/kardex.ts. Es un módulo de solo consulta.
 *
 * Dinero: cadenas con dos decimales (`"1500.00"`).
 */

export type KardexMovementKind = 'ENTRY' | 'EXIT' | 'ADJUSTMENT';

export interface KardexProduct {
  id: string;
  code: string;
  barcode: string | null;
  name: string;
  categoryName: string;
  price: string;
  cost: string;
  supplierName: string | null;
  stock: number;
  minStock: number;
  /** 0 = sin máximo. */
  maxStock: number;
  unit: UnitOfMeasure;
  description: string | null;
  /** ¿Vence? Si es así, un ingreso pide lote y fecha de vencimiento. */
  perishable: boolean;
  /** `YYYY-MM-DD` o `null` si no vence. */
  expirationDate: string | null;
  isActive: boolean;
}

/** Opción del selector de producto (incluye desactivados). */
export interface KardexProductOption {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  /** Stock actual: se ve en la lista del buscador. */
  stock: number;
}

export interface KardexReference {
  type: 'SALE' | 'PURCHASE_ORDER';
  id: string;
  number: number;
}

export interface KardexMovement {
  id: string;
  /** Fecha y hora (ISO 8601). */
  createdAt: string;
  type: KardexMovementKind;
  /** Descripción breve: «Recepción PED-0408», «Venta», «Conteo físico»… */
  concept: string;
  /** Solo el número: la factura del proveedor (entradas) o la venta (salidas); `null` si no hay. */
  document: string | null;
  /** Unidades que entran (0 si no es una entrada). */
  entry: number;
  /** Unidades que salen (0 si no es una salida). */
  exit: number;
  stockBefore: number;
  stockAfter: number;
  reference: KardexReference | null;
  /** Lotes con que entró, o el lote del que salió un egreso (HU-38); vacío si no hay. */
  lots: KardexLot[];
  /** Detalle de un egreso, o `null`. */
  detail: string | null;
}

/** Un lote que entró con un movimiento. `expirationDate`: `YYYY-MM-DD` o `null`. */
export interface KardexLot {
  lotNumber: string;
  expirationDate: string | null;
  quantity: number;
}

/** Unidades que entraron y salieron en un grupo de movimientos, y cuántos son. */
export interface KardexAmounts {
  entries: number;
  exits: number;
  count: number;
}

/** Filtro del historial: todos, solo entradas o solo salidas. */
export type KardexDirection = 'all' | 'entries' | 'exits';

export interface KardexMovementPage {
  items: KardexMovement[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Con el filtro aplicado: la fila «Totales». */
  totals: KardexAmounts;
  /** Todo el historial del producto: el resumen de la ficha. */
  summary: KardexAmounts;
}

/** Lote con unidades: lo que se elige en un egreso. */
export interface KardexStockLot {
  id: string;
  lotNumber: string;
  expirationDate: string | null;
  quantity: number;
}

/** Conceptos de un egreso (salidas que no son ventas), como los ve la persona. */
export const EXIT_CONCEPTS = {
  EXPIRED: 'Vencido / descartado',
  TRANSFER: 'Traslado',
  SUPPLIER_RETURN: 'Devolución a proveedor',
} as const;

export type KardexExitConcept = keyof typeof EXIT_CONCEPTS;

/** Ingreso sin pedido (compra directa). */
export interface KardexEntryPayload {
  supplierId: string;
  invoiceNumber: string;
  documentDate: string;
  quantity: number;
  unitCost: string;
  lots: { lotNumber: string; expirationDate: string | null; quantity: number }[];
}

/** Egreso de un lote. */
export interface KardexExitPayload {
  concept: KardexExitConcept;
  documentNumber: string;
  lotId: string;
  quantity: number;
  detail?: string;
}

/** Movimiento de la vista general: el de la ficha más el producto al que pertenece. */
export interface KardexRecentMovement extends KardexMovement {
  product: { id: string; code: string; name: string };
}

/** Vista general de Movimientos (sin producto elegido): todos los productos y el resumen de hoy. */
export interface KardexRecentPage {
  items: KardexRecentMovement[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Hoy: unidades que entraron, que salieron y cuántos movimientos. */
  today: KardexAmounts;
}
