import type { InventoryRepository } from '../repositories/inventory.repository.js';
import type { InventoryCountDto } from '../types/inventory.js';
import type { InventoryMovementPlan } from '../types/products.js';
import { HttpError } from '../utils/http-error.js';
import type { CreateInventoryCountInput } from '../validators/inventory.validator.js';

/** Motivo del movimiento que deja un conteo de inventario físico (HU-10). */
export const PHYSICAL_COUNT_REASON = 'Conteo físico';

/**
 * Ajuste que corresponde a un conteo físico.
 *
 * A diferencia de la edición de producto, se devuelve siempre un movimiento,
 * aunque el conteo coincida con el sistema (`quantity = 0`): así el historial
 * deja constancia de que el producto se contó y estaba correcto.
 */
export function buildCountAdjustment(
  systemStock: number,
  countedQuantity: number,
): InventoryMovementPlan {
  return {
    type: 'ADJUSTMENT',
    quantity: Math.abs(countedQuantity - systemStock),
    stockBefore: systemStock,
    stockAfter: countedQuantity,
    reason: PHYSICAL_COUNT_REASON,
  };
}

/**
 * Reglas de negocio del conteo de inventario físico (HU-10).
 *
 * No conoce HTTP ni Prisma: recibe el repositorio por constructor, decide qué
 * movimiento corresponde y delega la persistencia.
 */
export class InventoryService {
  constructor(private readonly repository: InventoryRepository) {}

  /**
   * HU-10 — registrar conteo físico.
   *
   * Compara la cantidad contada con el stock del sistema, deja el stock en lo
   * contado y guarda el ajuste con el antes y el después. No hay operación de
   * edición: un conteo confirmado es definitivo.
   */
  async registerCount(input: CreateInventoryCountInput): Promise<InventoryCountDto> {
    const product = await this.repository.findProductStock(input.productId);

    if (product === null) {
      throw HttpError.notFound('El producto no existe.');
    }

    return this.repository.createCount({
      productId: product.id,
      movement: buildCountAdjustment(product.stock, input.countedQuantity),
    });
  }

  /** Historial de conteos confirmados, del más reciente al más antiguo. */
  async listCounts(): Promise<InventoryCountDto[]> {
    return this.repository.listCounts(PHYSICAL_COUNT_REASON);
  }
}
