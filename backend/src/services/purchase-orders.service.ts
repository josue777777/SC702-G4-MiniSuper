import type { PurchaseOrdersRepository } from '../repositories/purchase-orders.repository.js';
import type {
  CreatePurchaseOrderPlan,
  MoneyLine,
  PurchaseOrderDto,
  PurchaseOrderSummaryDto,
} from '../types/purchase-orders.js';
import { HttpError } from '../utils/http-error.js';
import type {
  CreatePurchaseOrderInput,
  ListPurchaseOrdersQuery,
} from '../validators/purchase-orders.validator.js';

/** Convierte `"1500.25"` a céntimos enteros, para sumar dinero sin errores de coma flotante. */
function toCents(value: string): number {
  return Math.round(Number(value) * 100);
}

/** Total del pedido: suma de cantidad × costo, calculada en céntimos. */
export function calculateTotal(lines: MoneyLine[]): string {
  const cents = lines.reduce((sum, line) => sum + toCents(line.unitCost) * line.quantity, 0);

  return (cents / 100).toFixed(2);
}

/**
 * Reglas de negocio de los pedidos a proveedor (HU-22, HU-24).
 *
 * El dueño elige el proveedor, los productos y las cantidades; el costo de cada
 * línea es el acordado con ese proveedor (HU-21) y el total lo calcula el
 * sistema. Un pedido nuevo queda `PENDING` y en el historial; la recepción y el
 * aumento de stock son de HU-38.
 */
export class PurchaseOrdersService {
  constructor(private readonly repository: PurchaseOrdersRepository) {}

  /** HU-24 — registrar el pedido que luego se imprime o se guarda como PDF. */
  async createOrder(input: CreatePurchaseOrderInput): Promise<PurchaseOrderDto> {
    const catalog = await this.repository.findSupplierCatalog(input.supplierId);

    if (catalog === null) {
      throw HttpError.badRequest('El proveedor no existe o está inactivo.', {
        supplierId: ['El proveedor no existe o está inactivo.'],
      });
    }

    const costs = new Map(catalog.products.map((product) => [product.productId, product.unitCost]));
    const items: CreatePurchaseOrderPlan['items'] = [];

    for (const item of input.items) {
      const unitCost = costs.get(item.productId);

      if (unitCost === undefined) {
        throw HttpError.badRequest('Hay productos que este proveedor no suministra.', {
          items: [
            'Solo se pueden pedir productos activos asociados a este proveedor (se asocian en Proveedores).',
          ],
        });
      }

      items.push({ productId: item.productId, quantity: item.quantity, unitCost });
    }

    return this.repository.create({
      supplierId: input.supplierId,
      notes: input.notes,
      total: calculateTotal(items),
      items,
    });
  }

  /** HU-22 — historial, filtrable por proveedor. */
  async listOrders(query: ListPurchaseOrdersQuery): Promise<PurchaseOrderSummaryDto[]> {
    return this.repository.list(query.supplierId);
  }

  /** HU-22 — detalle completo de un pedido. */
  async getOrder(id: string): Promise<PurchaseOrderDto> {
    const order = await this.repository.findById(id);

    if (order === null) {
      throw HttpError.notFound('El pedido no existe.');
    }

    return order;
  }
}
