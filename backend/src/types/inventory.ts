/**
 * Contratos del módulo de inventario (HU-10).
 *
 * El tipo de movimiento y el plan de movimiento se reutilizan de
 * `types/products.ts` en lugar de repetirse: son los mismos para todo el
 * sistema y dos copias terminarían divergiendo.
 */
import type { InventoryMovementPlan } from './products.js';

/** Campos que envía el formulario de conteo físico (HU-10). */
export interface InventoryCountFields {
  productId: string;
  countedQuantity: number;
}

/**
 * Conteo físico tal como lo expone la API: es un `InventoryMovement` de tipo
 * `ADJUSTMENT`, presentado con los nombres que entiende el dueño.
 *
 * Es de solo lectura: una vez confirmado no se edita (HU-10).
 */
export interface InventoryCountDto {
  /** Id del movimiento de inventario que dejó el conteo. */
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  /** Stock que tenía el sistema antes del conteo (`stockBefore`). */
  systemStock: number;
  /** Cantidad contada físicamente: es el nuevo stock (`stockAfter`). */
  countedQuantity: number;
  /** `countedQuantity - systemStock`: negativa si faltaba mercadería, positiva si sobraba. */
  difference: number;
  /** Fecha y hora del ajuste, en formato ISO 8601. */
  createdAt: string;
}

/**
 * Producto activo con su stock y su mínimo, tal como lo lee el repositorio para
 * que el service decida si corresponde una alerta de stock bajo (HU-08).
 */
export interface StockLevel {
  productId: string;
  productCode: string;
  productName: string;
  stock: number;
  /** 0 significa "sin mínimo definido": nunca genera alerta. */
  minStock: number;
}

/**
 * Alerta de stock bajo (HU-08). No se guarda en la base: se calcula en cada
 * consulta (decisión 7 de ARCHITECTURE.md), así desaparece sola al reponer.
 */
export type LowStockAlertDto = StockLevel;

/**
 * Configuración de inventario de un producto activo: su mínimo de stock
 * (HU-08) y su fecha de vencimiento (HU-09). Se administra desde el módulo de
 * inventario, sin tocar el formulario de productos.
 */
export interface ProductStockSettingsDto {
  productId: string;
  productCode: string;
  productName: string;
  stock: number;
  minStock: number;
  /** `YYYY-MM-DD`, o `null` si el producto no vence. */
  expirationDate: string | null;
}

/** Estado de un producto con fecha de vencimiento cercana o pasada (HU-09). */
export type ExpirationStatus = 'EXPIRED' | 'EXPIRING_SOON';

/** Producto vencido o próximo a vencer (HU-09). Se calcula, no se guarda. */
export interface ExpirationAlertDto {
  productId: string;
  productCode: string;
  productName: string;
  stock: number;
  expirationDate: string;
  /** Días que faltan para vencer; negativo si ya venció, 0 si vence hoy. */
  daysLeft: number;
  status: ExpirationStatus;
}

/** Cuerpo de `PATCH /api/inventory/products/:id/min-stock` (HU-08). */
export interface MinStockFields {
  minStock: number;
}

/** Cuerpo de `PATCH /api/inventory/products/:id/expiration-date` (HU-09). */
export interface ExpirationDateFields {
  /** `YYYY-MM-DD`, o `null` para indicar que el producto no vence. */
  expirationDate: string | null;
}

/** Trabajo que el service encarga al repositorio al confirmar un conteo. */
export interface CreateInventoryCountPlan {
  productId: string;
  /** Ajuste a registrar; con diferencia 0 igual se guarda, para dejar constancia del conteo. */
  movement: InventoryMovementPlan;
}
