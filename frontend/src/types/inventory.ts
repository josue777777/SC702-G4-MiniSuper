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

/**
 * Alerta de stock bajo (HU-08): producto activo cuyo stock llegó a su mínimo o
 * bajó de él. No se guarda en la base; el backend la calcula en cada consulta.
 */
export interface LowStockAlert {
  productId: string;
  productCode: string;
  productName: string;
  stock: number;
  minStock: number;
}

/** Mínimo de stock (HU-08) y vencimiento (HU-09) de un producto activo. */
export interface ProductStockSettings {
  productId: string;
  productCode: string;
  productName: string;
  stock: number;
  /** 0 = sin mínimo definido. */
  minStock: number;
  /** `YYYY-MM-DD`, o `null` si el producto no vence. */
  expirationDate: string | null;
}

/**
 * Lote vencido o próximo a vencer (HU-09, HU-32): una alerta por lote con
 * unidades; un lote agotado ya no alerta.
 */
export interface ExpirationAlert {
  productId: string;
  productCode: string;
  productName: string;
  /** Stock total del producto. */
  stock: number;
  /** Número del lote («SIN LOTE» para lo que entró sin lote). */
  lotNumber: string;
  /** Unidades que quedan de ese lote. */
  lotQuantity: number;
  expirationDate: string;
  /** Negativo si ya venció; 0 si vence hoy. */
  daysLeft: number;
  status: 'EXPIRED' | 'EXPIRING_SOON';
}
