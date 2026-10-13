import type { InventoryRepository } from '../repositories/inventory.repository.js';
import type { InventoryCountDto, LowStockAlertDto } from '../types/inventory.js';
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
 * `true` si el producto necesita reponerse (HU-08): el stock llegó al mínimo o
 * bajó de él. Un mínimo de 0 significa que el dueño no lo definió, y entonces
 * nunca hay alerta (evita alertas falsas en productos sin mínimo).
 */
export function isLowStock(stock: number, minStock: number): boolean {
  return minStock > 0 && stock <= minStock;
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

  /**
   * HU-08 — alertas de stock bajo, calculadas al momento de consultar. Como no
   * se guardan, la alerta desaparece en cuanto el stock vuelve a superar el
   * mínimo (por un conteo, una edición o, más adelante, una compra).
   */
  async listLowStockAlerts(): Promise<LowStockAlertDto[]> {
    const levels = await this.repository.listStockLevels();

    return levels.filter((level) => isLowStock(level.stock, level.minStock));
  }
}
