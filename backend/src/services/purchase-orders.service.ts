import type { PurchaseOrdersRepository } from '../repositories/purchase-orders.repository.js';
import type {
  CreatePurchaseOrderPlan,
  MoneyLine,
  PurchaseOrderDto,
  PurchaseOrderSummaryDto,
} from '../types/purchase-orders.js';
import { dateToDateOnly, todayInBusinessZone } from '../utils/dates.js';
import { HttpError } from '../utils/http-error.js';
import type {
  CreatePurchaseOrderInput,
  ListPurchaseOrdersQuery,
  ReceiveOrderInput,
} from '../validators/purchase-orders.validator.js';

/** Convierte `"1500.25"` a céntimos enteros, para sumar dinero sin errores de coma flotante. */
function toCents(value: string): number {
  return Math.round(Number(value) * 100);
}

/**
 * Total del pedido: suma de cantidad × costo, calculada en céntimos para no
 * perder centavos con la coma flotante.
 *
 * @param lines Líneas con su costo acordado (texto con dos decimales).
 * @returns El total con dos decimales, como texto.
 * @example
 * calculateTotal([
 *   { quantity: 12, unitCost: '1800.00' },
 *   { quantity: 20, unitCost: '600.00' },
 * ]); // "33600.00"
 */
export function calculateTotal(lines: MoneyLine[]): string {
  const cents = lines.reduce((sum, line) => sum + toCents(line.unitCost) * line.quantity, 0);

  return (cents / 100).toFixed(2);
}

/**
 * Número del pedido para las personas: el mismo que va en el papel.
 *
 * @example formatOrderNumber(7); // "PED-0007"
 */
export function formatOrderNumber(number: number): string {
  return `PED-${String(number).padStart(4, '0')}`;
}

/**
 * Motivo de las entradas al inventario de una entrega: con el pedido y la
 * factura, así en el Kardex se sabe de dónde salió cada unidad.
 *
 * @example receiptReason(7, 'F-120'); // "Recepción PED-0007 · Factura F-120"
 */
export function receiptReason(orderNumber: number, invoiceNumber: string): string {
  return `Recepción ${formatOrderNumber(orderNumber)} · Factura ${invoiceNumber}`;
}

/**
 * Reglas de negocio de los pedidos a proveedor (HU-22, HU-24).
 *
 * El dueño elige el proveedor, los productos y las cantidades; el costo de cada
 * línea es el acordado con ese proveedor (HU-21) y el total lo calcula el
 * sistema. Un pedido nuevo queda `PENDING` y en el historial.
 *
 * Recepción (HU-38): el pedido se recibe en una o varias entregas, cada una con
 * su factura, su fecha real y lo que llegó. Cargarla al inventario puede ser en
 * el momento o quedar pendiente hasta que alguien la confirme.
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

  /**
   * HU-38 — registrar una entrega con su factura. El pedido sigue abierto
   * (`PARTIAL`) hasta que llega todo o se da por concluido.
   *
   * Reglas: no se recibe más de lo que falta de cada producto, solo productos
   * del pedido, y la fecha real no puede ser futura ni anterior al pedido.
   */
  async receiveOrder(id: string, input: ReceiveOrderInput, today = todayInBusinessZone()) {
    const order = await this.getOrder(id);

    if (order.status === 'RECEIVED') {
      throw HttpError.conflict('El pedido ya está cerrado: no se le pueden registrar entregas.');
    }

    if (input.receivedOn > today) {
      throw HttpError.badRequest('La fecha de llegada no puede ser futura.', {
        receivedOn: ['La fecha de llegada no puede ser futura.'],
      });
    }

    if (input.receivedOn < dateToDateOnly(new Date(order.createdAt))) {
      throw HttpError.badRequest('La mercadería no puede llegar antes de hacer el pedido.', {
        receivedOn: ['La mercadería no puede llegar antes de hacer el pedido.'],
      });
    }

    const lines = new Map(order.items.map((item) => [item.productId, item]));
    const items = input.items.filter((item) => item.quantity > 0);

    for (const item of items) {
      const line = lines.get(item.productId);

      if (line === undefined) {
        throw HttpError.badRequest('Hay productos que no son de este pedido.', {
          items: ['Solo se reciben productos del pedido.'],
        });
      }

      if (item.quantity > line.pendingQuantity) {
        throw HttpError.badRequest(
          `De ${line.productName} faltan ${line.pendingQuantity}: no puede llegar más.`,
          { items: [`De ${line.productName} faltan ${line.pendingQuantity}.`] },
        );
      }
    }

    return this.repository.receive(id, {
      invoiceNumber: input.invoiceNumber,
      receivedOn: input.receivedOn,
      loadNow: input.loadNow,
      items,
      reason: receiptReason(order.number, input.invoiceNumber),
    });
  }

  /** HU-38 — cargar al inventario una entrega que había quedado pendiente. */
  async loadReceipt(id: string, receiptId: string): Promise<PurchaseOrderDto> {
    const order = await this.getOrder(id);
    const receipt = order.receipts.find((candidate) => candidate.id === receiptId);

    if (receipt === undefined) {
      throw HttpError.notFound('La entrega no existe.');
    }

    return this.repository.loadReceipt(
      id,
      receiptId,
      receiptReason(order.number, receipt.invoiceNumber),
    );
  }

  /** HU-38 — dar por concluido un pedido que llegó en parte. */
  async closeOrder(id: string): Promise<PurchaseOrderDto> {
    await this.getOrder(id);

    return this.repository.close(id);
  }
}
