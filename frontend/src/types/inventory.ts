/**
 * Contratos del módulo de inventario en el frontend (HU-10).
 *
 * Copia de lo que publica el backend (`backend/src/types/inventory.ts`), por la
 * misma razón que el resto de `src/types/`: Vite no puede importar código de
 * `backend/src`.
 */

/** Conteo físico confirmado, tal como lo devuelve la API. Es de solo lectura. */
export interface InventoryCount {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  /** Stock que tenía el sistema antes del conteo. */
  systemStock: number;
  /** Cantidad contada físicamente: es el nuevo stock. */
  countedQuantity: number;
  /** `countedQuantity - systemStock`: negativa si faltaba mercadería. */
  difference: number;
  /** Fecha y hora del ajuste en ISO 8601 (UTC). */
  createdAt: string;
}

/** Cuerpo que acepta `POST /api/inventory/counts`. */
export interface InventoryCountPayload {
  productId: string;
  /** Entero mayor o igual a 0; el backend rechaza los negativos. */
  countedQuantity: number;
}
