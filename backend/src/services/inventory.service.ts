import type { InventoryRepository } from '../repositories/inventory.repository.js';
import type {
  ExpirationAlertDto,
  InventoryCountDto,
  LowStockAlertDto,
  ProductStockSettingsDto,
} from '../types/inventory.js';
import { daysBetween, todayInBusinessZone } from '../utils/dates.js';
import type { InventoryMovementPlan } from '../types/products.js';
import { HttpError } from '../utils/http-error.js';
import type {
  CreateInventoryCountInput,
  UpdateExpirationDateInput,
  UpdateMinStockInput,
} from '../validators/inventory.validator.js';

/** HU-09: con menos de estos días para vencer, el producto está "próximo a vencer". */
export const EXPIRING_SOON_DAYS = 15;

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
 * Clasifica un vencimiento (HU-09): vencido si la fecha ya pasó, próximo a
 * vencer si faltan menos de `EXPIRING_SOON_DAYS` días (vencer hoy cuenta como
 * próximo), o `null` si todavía falta tiempo.
 */
export function classifyExpiration(daysLeft: number): ExpirationAlertDto['status'] | null {
  if (daysLeft < 0) {
    return 'EXPIRED';
  }

  return daysLeft < EXPIRING_SOON_DAYS ? 'EXPIRING_SOON' : null;
}

/**
 * Reglas de negocio del conteo de inventario físico (HU-10).
 *
 * No conoce HTTP ni Prisma: recibe el repositorio por constructor, decide qué
 * movimiento corresponde y delega la persistencia.
 */
export class InventoryService {
  /**
   * `today` devuelve la fecha de hoy (`YYYY-MM-DD`) en la zona del negocio. Se
   * recibe por constructor para que las pruebas fijen el día.
   */
  constructor(
    private readonly repository: InventoryRepository,
    private readonly today: () => string = () => todayInBusinessZone(),
  ) {}

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

  /** Mínimo y vencimiento de los productos activos, para configurarlos (HU-08, HU-09). */
  async listProductSettings(): Promise<ProductStockSettingsDto[]> {
    return this.repository.listProductSettings();
  }

  /** HU-08 — define el mínimo de stock de un producto (0 = sin mínimo). */
  async updateMinStock(
    productId: string,
    input: UpdateMinStockInput,
  ): Promise<ProductStockSettingsDto> {
    await this.assertProductExists(productId);

    return this.repository.updateMinStock(productId, input.minStock);
  }

  /**
   * HU-09 — guarda o quita la fecha de vencimiento.
   *
   * `null` es válido: el campo es opcional para los productos que no vencen.
   * Una fecha nueva o cambiada tiene que ser futura; volver a guardar la misma
   * fecha que ya tenía se acepta aunque ya esté cerca o haya pasado.
   */
  async updateExpirationDate(
    productId: string,
    input: UpdateExpirationDateInput,
  ): Promise<ProductStockSettingsDto> {
    const current = await this.assertProductExists(productId);
    const { expirationDate } = input;

    if (
      expirationDate !== null &&
      expirationDate !== current.expirationDate &&
      expirationDate <= this.today()
    ) {
      throw HttpError.badRequest('La fecha de vencimiento debe ser una fecha futura.', {
        expirationDate: ['La fecha de vencimiento debe ser posterior a hoy.'],
      });
    }

    return this.repository.updateExpirationDate(productId, expirationDate);
  }

  /**
   * HU-09 — productos vencidos o próximos a vencer, del más urgente al menos
   * urgente. Se calcula al consultar; no se guarda (decisión 7).
   */
  async listExpirations(): Promise<ExpirationAlertDto[]> {
    const today = this.today();
    const settings = await this.repository.listProductSettings();
    const alerts: ExpirationAlertDto[] = [];

    for (const product of settings) {
      if (product.expirationDate === null) {
        continue;
      }

      const daysLeft = daysBetween(today, product.expirationDate);
      const status = classifyExpiration(daysLeft);

      if (status !== null) {
        alerts.push({
          productId: product.productId,
          productCode: product.productCode,
          productName: product.productName,
          stock: product.stock,
          expirationDate: product.expirationDate,
          daysLeft,
          status,
        });
      }
    }

    return alerts.sort((a, b) => a.daysLeft - b.daysLeft);
  }

  /** Lanza `404` si el producto no existe; si existe, devuelve su configuración. */
  private async assertProductExists(productId: string): Promise<ProductStockSettingsDto> {
    const product = await this.repository.findProductSettings(productId);

    if (product === null) {
      throw HttpError.notFound('El producto no existe.');
    }

    return product;
  }
}
