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
  /** Motivo registrado o, si no hay, una descripción según el tipo. */
  concept: string;
  /** Unidades que entran (0 si el movimiento no es una entrada). */
  entry: number;
  /** Unidades que salen (0 si el movimiento no es una salida). */
  exit: number;
  stockBefore: number;
  stockAfter: number;
  reference: KardexReference | null;
}

export interface KardexMovementPage {
  items: KardexMovementDto[];
  page: number;
  pageSize: number;
  /** Movimientos totales del producto. */
  total: number;
  totalPages: number;
}

export interface KardexMovementsQuery {
  page: number;
  pageSize: number;
}
