/**
 * Contratos del Kardex: ficha e historial de movimientos de un producto (HU-31).
 * El frontend mantiene su copia en `frontend/src/types/kardex.ts`.
 *
 * Es un módulo de SOLO CONSULTA: nada de aquí cambia stock ni crea movimientos.
 * Dinero: cadenas con dos decimales (`"1500.00"`), como en `types/products.ts`.
 */

import type { UnitOfMeasure } from './products.js';

export type KardexMovementKind = 'ENTRY' | 'EXIT' | 'ADJUSTMENT';

/** Importe tal como lo entrega Prisma (`Decimal`): solo se necesita `toFixed`. */
interface DecimalLike {
  toFixed(digits: number): string;
}

/** Producto de la ficha, con lo que lee el repositorio. */
export interface KardexProductRow {
  id: string;
  code: string;
  barcode: string | null;
  name: string;
  price: DecimalLike;
  cost: DecimalLike;
  stock: number;
  minStock: number;
  maxStock: number;
  unit: UnitOfMeasure;
  description: string | null;
  perishable: boolean;
  expirationDate: Date | null;
  /** El lote con unidades que vence primero (como mucho uno). */
  lots: { expirationDate: Date | null }[];
  isActive: boolean;
  category: { name: string };
  /** Solo el proveedor principal (`isPreferred`). */
  supplierProducts: { supplier: { name: string } }[];
}

/** Ficha del producto tal como la expone la API. */
export interface KardexProductDto {
  id: string;
  code: string;
  barcode: string | null;
  name: string;
  categoryName: string;
  price: string;
  cost: string;
  /** Proveedor principal, o `null` si no tiene. */
  supplierName: string | null;
  stock: number;
  minStock: number;
  /** Stock máximo que conviene tener; 0 = sin máximo. */
  maxStock: number;
  /** Unidad en que se cuenta el stock. */
  unit: UnitOfMeasure;
  description: string | null;
  /** ¿Vence? Si es así, un ingreso pide lote y fecha de vencimiento. */
  perishable: boolean;
  /**
   * `YYYY-MM-DD`: el lote con unidades que vence primero (o, sin lotes con
   * fecha, la del producto); `null` si no vence.
   */
  expirationDate: string | null;
  isActive: boolean;
}

/** Opción del selector de producto: se incluyen los desactivados, que también tienen historial. */
export interface KardexProductOption {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  /** Stock actual: se ve en la lista del buscador. */
  stock: number;
}

/** Movimiento tal como lo lee el repositorio. */
export interface KardexMovementRow {
  id: string;
  type: KardexMovementKind;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  reason: string | null;
  createdAt: Date;
  sale: { id: string; number: number } | null;
  purchaseOrder: { id: string; number: number } | null;
  /** Entrega (factura) que cargó la entrada (HU-38). */
  receipt: { invoiceNumber: string } | null;
  /** Lotes que entraron con este movimiento (HU-38). */
  lots: { lotNumber: string; expirationDate: Date | null; receivedQuantity: number }[];
  /** Documento de un ingreso o egreso registrado en Movimientos. */
  documentNumber: string | null;
  /** Detalle libre de un egreso. */
  detail: string | null;
  /** Lote del que salió un egreso. */
  exitLot: { lotNumber: string; expirationDate: Date | null } | null;
}

/** Un lote que entró con un movimiento: número, vencimiento y cuántas unidades. */
export interface KardexLotDto {
  lotNumber: string;
  /** `YYYY-MM-DD`, o `null` si el producto no vence. */
  expirationDate: string | null;
  quantity: number;
}

/** Documento que originó el movimiento. Solo su número: nada de importes ni clientes. */
export interface KardexReference {
  type: 'SALE' | 'PURCHASE_ORDER';
  id: string;
  number: number;
}

export interface KardexMovementDto {
  id: string;
  /** Fecha y hora (ISO 8601). */
  createdAt: string;
  type: KardexMovementKind;
  /**
   * Descripción breve: «Recepción PED-0408», «Venta», «Devolución de cliente»,
   * «Conteo físico»… (`movementConcept`).
   */
  concept: string;
  /**
   * Solo el número del documento: la factura del proveedor en una entrada
   * (`na-o1`) o el número de venta en una salida (`408`); `null` si no hay.
   */
  document: string | null;
  /** Unidades que entran (0 si el movimiento no es una entrada). */
  entry: number;
  /** Unidades que salen (0 si el movimiento no es una salida). */
  exit: number;
  stockBefore: number;
  stockAfter: number;
  reference: KardexReference | null;
  /** Lotes con que entró, o el lote del que salió un egreso (HU-38); vacío si no hay. */
  lots: KardexLotDto[];
  /** Detalle de un egreso, o `null`. */
  detail: string | null;
}

/** Unidades que entraron y salieron en un grupo de movimientos, y cuántos son. */
export interface KardexAmounts {
  entries: number;
  exits: number;
  count: number;
}

export interface KardexMovementPage {
  items: KardexMovementDto[];
  page: number;
  pageSize: number;
  /** Movimientos del producto con el filtro aplicado. */
  total: number;
  totalPages: number;
  /** Totales con el filtro aplicado (la fila «Totales» de la tabla). */
  totals: KardexAmounts;
  /** Todo el historial del producto, sin filtro (el resumen de la ficha). */
  summary: KardexAmounts;
}

/** Movimiento de cualquier producto, tal como lo lee el repositorio (vista general). */
export interface KardexRecentMovementRow extends KardexMovementRow {
  product: { id: string; code: string; name: string };
}

/** Lo justo de un movimiento para sumar lo que entró y salió hoy. */
export type KardexAmountRow = Pick<
  KardexMovementRow,
  'type' | 'quantity' | 'stockBefore' | 'stockAfter'
>;

/** Movimiento de la vista general: el de la ficha más el producto al que pertenece. */
export interface KardexRecentMovementDto extends KardexMovementDto {
  product: { id: string; code: string; name: string };
}

/**
 * Vista general de Movimientos, cuando todavía no se eligió un producto: los
 * últimos movimientos del negocio (de todos los productos) y el resumen de hoy.
 */
export interface KardexRecentPage {
  items: KardexRecentMovementDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Hoy, en la zona del negocio: unidades que entraron, que salieron y cuántos movimientos. */
  today: KardexAmounts;
}

/** Qué movimientos se listan: todos, solo los que suben el stock o solo los que lo bajan. */
export type KardexDirection = 'all' | 'entries' | 'exits';

export interface KardexMovementsQuery {
  page: number;
  pageSize: number;
  /** Sin indicar: todos. */
  direction?: KardexDirection | undefined;
}

/** Lote con unidades, tal como lo lee el repositorio. */
export interface KardexStockLotRow {
  id: string;
  lotNumber: string;
  expirationDate: Date | null;
  quantity: number;
}

/** Lote con unidades en inventario: lo que se puede elegir en un egreso. */
export interface KardexStockLotDto {
  id: string;
  lotNumber: string;
  /** `YYYY-MM-DD`, o `null` si no vence. */
  expirationDate: string | null;
  quantity: number;
}

/**
 * Conceptos de un egreso registrado en Movimientos (salidas que no son
 * ventas: esas salen solas desde la caja), con el texto que ve la persona.
 */
export const EXIT_CONCEPTS = {
  EXPIRED: 'Vencido / descartado',
  TRANSFER: 'Traslado',
  SUPPLIER_RETURN: 'Devolución a proveedor',
} as const;

export type KardexExitConcept = keyof typeof EXIT_CONCEPTS;

/** Concepto de un ingreso sin pedido (compra directa al proveedor). */
export const DIRECT_PURCHASE_CONCEPT = 'Compra directa';

/** Ingreso sin pedido (HU-38): lo que envía el formulario. */
export interface KardexEntryFields {
  supplierId: string;
  invoiceNumber: string;
  /** `YYYY-MM-DD`: el día de la factura (no futuro). */
  documentDate: string;
  quantity: number;
  /** Costo unitario, `"4850.00"`. */
  unitCost: string;
  lots?: { lotNumber: string; expirationDate: string | null; quantity: number }[] | undefined;
}

/** Egreso (HU-38): salida que no es venta, de un lote elegido. */
export interface KardexExitFields {
  concept: KardexExitConcept;
  documentNumber: string;
  lotId: string;
  quantity: number;
  detail?: string | undefined;
}
