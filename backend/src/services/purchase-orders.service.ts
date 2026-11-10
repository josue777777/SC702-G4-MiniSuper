import type { PurchaseOrdersRepository } from '../repositories/purchase-orders.repository.js';
import type {
  CreatePurchaseOrderPlan,
  MoneyLine,
  PurchaseOrderDto,
  PurchaseOrderSummaryDto,
  RestockCandidate,
  RestockSuggestionDto,
  RestockSuggestionGroupDto,
  RestockSupplierOption,
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

export const NO_SUGGESTIONS_MESSAGE =
  'No hay productos por debajo de su stock mínimo: no hay sugerencias de pedido pendientes.';

/** Tope por línea, el mismo que acepta `POST /api/purchase-orders`. */
const MAX_SUGGESTED_QUANTITY = 1_000_000;

/**
 * HU-23 — cuánto pedir: lo necesario para llegar al doble del mínimo, sin
 * contar lo que ya viene en pedidos pendientes. `0` = no hace falta pedir.
 */
export function suggestQuantity(stock: number, minStock: number, pendingQuantity: number): number {
  return Math.min(MAX_SUGGESTED_QUANTITY, Math.max(0, minStock * 2 - stock - pendingQuantity));
}

/**
 * A quién pedirle un producto (HU-23): al proveedor principal; si ninguno lo
 * es, al más barato (y, a igual costo, por nombre). `null` si no tiene.
 */
export function pickSupplier(options: RestockSupplierOption[]): RestockSupplierOption | null {
  const preferred = options.find((option) => option.isPreferred);

  if (preferred !== undefined) {
    return preferred;
  }

  const sorted = [...options].sort(
    (a, b) =>
      toCents(a.unitCost) - toCents(b.unitCost) || a.supplierName.localeCompare(b.supplierName),
  );

  return sorted[0] ?? null;
}

/** Arma la sugerencia agrupada por proveedor; el grupo sin proveedor va al final. */
export function buildRestockSuggestion(candidates: RestockCandidate[]): RestockSuggestionDto {
  const groups = new Map<string | null, RestockSuggestionGroupDto>();

  for (const candidate of candidates) {
    const suggestedQuantity = suggestQuantity(
      candidate.stock,
      candidate.minStock,
      candidate.pendingQuantity,
    );

    if (suggestedQuantity === 0) {
      continue;
    }

    const supplier = pickSupplier(candidate.suppliers);
    const key = supplier?.supplierId ?? null;
    let group = groups.get(key);

    if (group === undefined) {
      group = {
        supplierId: key,
        supplierName: supplier?.supplierName ?? null,
        items: [],
        total: '0.00',
      };
      groups.set(key, group);
    }

    group.items.push({
      productId: candidate.productId,
      productCode: candidate.productCode,
      productName: candidate.productName,
      stock: candidate.stock,
      minStock: candidate.minStock,
      pendingQuantity: candidate.pendingQuantity,
      suggestedQuantity,
      unitCost: supplier?.unitCost ?? null,
    });
  }

  const sorted = [...groups.values()]
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => a.productName.localeCompare(b.productName)),
      total:
        group.supplierId === null
          ? '0.00'
          : calculateTotal(
              group.items.map((item) => ({
                quantity: item.suggestedQuantity,
                unitCost: item.unitCost ?? '0.00',
              })),
            ),
    }))
    .sort((a, b) => {
      if (a.supplierName === null || b.supplierName === null) {
        return a.supplierName === null ? 1 : -1;
      }

      return a.supplierName.localeCompare(b.supplierName);
    });

  return { groups: sorted, message: sorted.length === 0 ? NO_SUGGESTIONS_MESSAGE : null };
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

  /** HU-23 — lista sugerida de productos a pedir, agrupada por proveedor. */
  async getRestockSuggestion(): Promise<RestockSuggestionDto> {
    return buildRestockSuggestion(await this.repository.listRestockCandidates());
  }
}
