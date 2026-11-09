import type { PurchaseOrdersRepository } from '../repositories/purchase-orders.repository.js';
import type {
  CreatePurchaseOrderPlan,
  MoneyLine,
  PurchaseOrderDto,
  PurchaseOrderSummaryDto,
  ReceiptInvoiceFile,
  ReceiptLotFields,
} from '../types/purchase-orders.js';
import { hasInvoiceSignature } from '../utils/invoice-file.js';
import { todayInBusinessZone } from '../utils/dates.js';
import { HttpError } from '../utils/http-error.js';
import type {
  CreatePurchaseOrderInput,
  ListPurchaseOrdersQuery,
  ReceiptInvoiceInput,
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
 * Lotes de lo que llegó de un producto (HU-38), revisados y completos.
 *
 * - Un producto que **vence** necesita, en cada lote, número de lote y fecha
 *   de vencimiento; un lote que ya venció el día en que llegó no se recibe.
 * - Un producto que **no vence** no lleva fecha; si no se escribe el lote,
 *   el lote es el número de factura (así «se registra igual que siempre»).
 * - Los lotes suman exactamente lo que llegó y no se repiten.
 *
 * @param product Nombre (para los mensajes) y si vence.
 * @param item Lo que llegó y cómo vino partido (`lots` puede faltar).
 * @param invoiceNumber Factura de la entrega: lote por defecto si no vence.
 * @param receivedOn Día en que llegó, `YYYY-MM-DD`.
 * @returns Los lotes a guardar.
 * @throws HttpError 400 con un mensaje claro si algo no cuadra.
 * @example
 * resolveReceiptLots({ productName: 'Detergente', perishable: false }, { quantity: 6 }, 'F-120', '2026-11-08');
 * // [{ lotNumber: 'F-120', expirationDate: null, quantity: 6 }]
 * resolveReceiptLots({ productName: 'Leche', perishable: true }, {
 *   quantity: 10,
 *   lots: [
 *     { lotNumber: 'L-01', expirationDate: '2026-12-01', quantity: 6 },
 *     { lotNumber: 'L-02', expirationDate: '2026-12-15', quantity: 4 },
 *   ],
 * }, 'F-120', '2026-11-08'); // los mismos dos lotes
 */
export function resolveReceiptLots(
  product: { productName: string; perishable: boolean },
  item: { quantity: number; lots?: ReceiptLotFields[] | undefined },
  invoiceNumber: string,
  receivedOn: string,
): ReceiptLotFields[] {
  const name = product.productName;
  const fail = (message: string): never => {
    throw HttpError.badRequest(message, { items: [message] });
  };
  const given = item.lots ?? [];

  if (given.length === 0) {
    if (product.perishable) {
      fail(`Indique el lote y la fecha de vencimiento de ${name}.`);
    }

    return [{ lotNumber: invoiceNumber, expirationDate: null, quantity: item.quantity }];
  }

  const lots = given.map((lot) => ({
    lotNumber:
      lot.lotNumber.trim() === '' && !product.perishable ? invoiceNumber : lot.lotNumber.trim(),
    expirationDate: product.perishable ? lot.expirationDate : null,
    quantity: lot.quantity,
  }));
  const seen = new Set<string>();

  for (const lot of lots) {
    if (lot.lotNumber === '') {
      fail(`Indique el número de lote de ${name}.`);
    }

    if (product.perishable && lot.expirationDate === null) {
      fail(`Indique la fecha de vencimiento del lote ${lot.lotNumber} de ${name}.`);
    }

    if (lot.expirationDate !== null && lot.expirationDate < receivedOn) {
      fail(`El lote ${lot.lotNumber} de ${name} ya estaba vencido cuando llegó.`);
    }

    if (seen.has(lot.lotNumber.toLowerCase())) {
      fail(`El lote ${lot.lotNumber} de ${name} está repetido.`);
    }

    seen.add(lot.lotNumber.toLowerCase());
  }

  const total = lots.reduce((sum, lot) => sum + lot.quantity, 0);

  if (total !== item.quantity) {
    fail(`Los lotes de ${name} suman ${total}, pero llegaron ${item.quantity}.`);
  }

  return lots;
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

    // El día del pedido en Costa Rica: un pedido de las 8 p. m. ya es «mañana» en UTC.
    if (input.receivedOn < todayInBusinessZone(new Date(order.createdAt))) {
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
      items: items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        // `lines` ya se revisó arriba: cada producto es del pedido.
        lots: resolveReceiptLots(
          lines.get(item.productId) ?? { productName: '', perishable: true },
          item,
          input.invoiceNumber,
          input.receivedOn,
        ),
      })),
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

  /**
   * HU-38 — adjuntar la factura del proveedor a una entrega (al registrarla o
   * después). Se rechaza un archivo cuyo contenido no es del tipo que dice ser.
   */
  async attachReceiptInvoice(
    id: string,
    receiptId: string,
    input: ReceiptInvoiceInput,
  ): Promise<PurchaseOrderDto> {
    if (!hasInvoiceSignature(input.mimeType, input.data)) {
      throw HttpError.badRequest('El archivo no es un PDF ni una imagen válida.');
    }

    return this.repository.setReceiptInvoice(id, receiptId, input);
  }

  /** HU-38 — la factura adjunta de una entrega, para verla o descargarla. */
  async getReceiptInvoice(id: string, receiptId: string): Promise<ReceiptInvoiceFile> {
    const file = await this.repository.findReceiptInvoice(id, receiptId);

    if (file === null) {
      throw HttpError.notFound('Esta entrega no tiene factura adjunta.');
    }

    return file;
  }

  /** HU-38 — dar por concluido un pedido que llegó en parte. */
  async closeOrder(id: string): Promise<PurchaseOrderDto> {
    await this.getOrder(id);

    return this.repository.close(id);
  }
}
