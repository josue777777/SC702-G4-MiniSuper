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

/** Trabajo que el service encarga al repositorio al confirmar un conteo. */
export interface CreateInventoryCountPlan {
  productId: string;
  /** Ajuste a registrar; con diferencia 0 igual se guarda, para dejar constancia del conteo. */
  movement: InventoryMovementPlan;
}
