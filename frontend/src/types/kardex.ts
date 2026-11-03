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
  concept: string;
  /** Unidades que entran (0 si no es una entrada). */
  entry: number;
  /** Unidades que salen (0 si no es una salida). */
  exit: number;
  stockBefore: number;
  stockAfter: number;
  reference: KardexReference | null;
}

export interface KardexMovementPage {
  items: KardexMovement[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
