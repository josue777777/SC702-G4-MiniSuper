/**
 * Contratos del Kardex: ficha e historial de movimientos de un producto (HU-31).
 * El frontend mantiene su copia en `frontend/src/types/kardex.ts`.
 *
 * Es un módulo de SOLO CONSULTA: nada de aquí cambia stock ni crea movimientos.
 * Dinero: cadenas con dos decimales (`"1500.00"`), como en `types/products.ts`.
 */

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
  expirationDate: Date | null;
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
  /** `YYYY-MM-DD` o `null` si no vence. */
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
  /** Lotes con que entró (HU-38); vacío si el movimiento no trajo lotes. */
  lots: KardexLotDto[];
}

export interface KardexMovementPage {
  items: KardexMovementDto[];
  page: number;
  pageSize: number;
  /** Movimientos totales del producto. */
  total: number;
  totalPages: number;
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
  today: { entries: number; exits: number; count: number };
}

export interface KardexMovementsQuery {
  page: number;
  pageSize: number;
}
