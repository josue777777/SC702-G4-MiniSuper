import type { PurchaseOrdersRepository } from '../repositories/purchase-orders.repository.js';
import type {
  CreatePurchaseOrderPlan,
  PurchaseOrderDto,
  PurchaseOrderSummaryDto,
  ReceiptInvoiceFile,
  ReceiveOrderPlan,
  SupplierCatalog,
} from '../types/purchase-orders.js';
import { HttpError } from '../utils/http-error.js';
import { TEST_BUSINESS_ID } from './fake-session.js';

/** Doble de repositorio de pedidos a proveedor (HU-22, HU-24), en memoria. */

export const SUPPLIER_ID = '66666666-6666-4666-8666-666666666666';
export const OTHER_SUPPLIER_ID = '66666666-7777-4777-8777-777777777777';
export const INACTIVE_SUPPLIER_ID = '66666666-8888-4888-8888-888888888888';
export const COFFEE_ID = '77777777-1111-4111-8111-111111111111';
export const RICE_ID = '77777777-2222-4222-8222-222222222222';
export const NOT_SUPPLIED_ID = '77777777-3333-4333-8333-333333333333';
export const MISSING_ORDER_ID = '88888888-9999-4999-8999-999999999999';

const PRODUCTS: Record<string, { code: string; name: string }> = {
  [COFFEE_ID]: { code: 'P001', name: 'Café molido 500 g' },
  [RICE_ID]: { code: 'P002', name: 'Arroz 1 kg' },
};

const SUPPLIERS: Record<string, { name: string; catalog: Record<string, string> }> = {
  [SUPPLIER_ID]: {
    name: 'Distribuidora Central',
    catalog: { [COFFEE_ID]: '1000.50', [RICE_ID]: '700.00' },
  },
  [OTHER_SUPPLIER_ID]: { name: 'Lácteos del Valle', catalog: { [RICE_ID]: '690.00' } },
};

export class FakePurchaseOrdersRepository implements PurchaseOrdersRepository {
  readonly businessId = TEST_BUSINESS_ID;

  readonly createdPlans: CreatePurchaseOrderPlan[] = [];
  /** Entregas recibidas (HU-38), con el pedido al que van. */
  readonly receivedPlans: { orderId: string; plan: ReceiveOrderPlan }[] = [];
  /** Motivos con que se cargaron entregas al inventario, en orden. */
  readonly loadReasons: string[] = [];
  private readonly orders: PurchaseOrderDto[] = [];
  private sequence = 0;

  findSupplierCatalog(supplierId: string): Promise<SupplierCatalog | null> {
    const supplier = SUPPLIERS[supplierId];

    return Promise.resolve(
      supplier === undefined
        ? null
        : {
            supplierId,
            products: Object.entries(supplier.catalog).map(([productId, unitCost]) => ({
              productId,
              productName: PRODUCTS[productId]?.name ?? '?',
              unitCost,
            })),
          },
    );
  }

  create(plan: CreatePurchaseOrderPlan): Promise<PurchaseOrderDto> {
    this.createdPlans.push(plan);
    this.sequence += 1;

    const order: PurchaseOrderDto = {
      id: `88888888-0000-4000-8000-${String(this.sequence).padStart(12, '0')}`,
      // Como el consecutivo de la base: 1, 2, 3…
      number: this.sequence,
      supplierId: plan.supplierId,
      supplierName: SUPPLIERS[plan.supplierId]?.name ?? '?',
      supplierPhone: null,
      supplierEmail: null,
      status: 'PENDING',
      total: plan.total,
      itemCount: plan.items.length,
      productNames: plan.items.map((item) => PRODUCTS[item.productId]?.name ?? '?').sort(),
      notes: plan.notes,
      // Fechas crecientes para que el orden del historial sea predecible.
      createdAt: new Date(Date.UTC(2026, 9, 14, 12, this.sequence)).toISOString(),
      items: plan.items.map((item) => ({
        productId: item.productId,
        productCode: PRODUCTS[item.productId]?.code ?? '?',
        productName: PRODUCTS[item.productId]?.name ?? '?',
        quantity: item.quantity,
        unitCost: item.unitCost,
        subtotal: ((Math.round(Number(item.unitCost) * 100) * item.quantity) / 100).toFixed(2),
        receivedQuantity: 0,
        pendingQuantity: item.quantity,
        // Los productos del doble no vencen: sus entregas no piden lote (HU-38).
        perishable: false,
      })),
      receivedOn: null,
      pendingLoads: 0,
      invoiceNumbers: [],
      receipts: [],
    };
    this.orders.push(order);

    return Promise.resolve(order);
  }

  list(supplierId?: string): Promise<PurchaseOrderSummaryDto[]> {
    return Promise.resolve(
      this.orders
        .filter((order) => supplierId === undefined || order.supplierId === supplierId)
        .map((order) => ({
          id: order.id,
          number: order.number,
          supplierId: order.supplierId,
          supplierName: order.supplierName,
          status: order.status,
          total: order.total,
          itemCount: order.itemCount,
          productNames: order.productNames,
          createdAt: order.createdAt,
          receivedOn: order.receivedOn,
          pendingLoads: order.pendingLoads,
          invoiceNumbers: order.receipts.map((receipt) => receipt.invoiceNumber),
        }))
        .reverse(),
    );
  }

  findById(id: string): Promise<PurchaseOrderDto | null> {
    return Promise.resolve(this.orders.find((order) => order.id === id) ?? null);
  }

  /** Como el real, pero sin base: suma lo recibido y crea la entrega en memoria. */
  receive(orderId: string, plan: ReceiveOrderPlan): Promise<PurchaseOrderDto> {
    const order = this.orderOrThrow(orderId);

    if (order.receipts.some((receipt) => receipt.invoiceNumber === plan.invoiceNumber)) {
      throw HttpError.conflict('Esa factura ya está registrada en este pedido.');
    }

    this.receivedPlans.push({ orderId, plan });

    for (const item of plan.items) {
      const line = order.items.find((candidate) => candidate.productId === item.productId);

      if (line !== undefined) {
        line.receivedQuantity += item.quantity;
        line.pendingQuantity = Math.max(0, line.quantity - line.receivedQuantity);
      }
    }

    order.receipts.unshift({
      id: `99999999-0000-4000-8000-${String(this.receivedPlans.length).padStart(12, '0')}`,
      invoiceNumber: plan.invoiceNumber,
      receivedOn: plan.receivedOn,
      loadedAt: plan.loadNow ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
      items: plan.items.map((item) => ({
        productId: item.productId,
        productCode: PRODUCTS[item.productId]?.code ?? '?',
        productName: PRODUCTS[item.productId]?.name ?? '?',
        quantity: item.quantity,
        lots: item.lots,
      })),
      invoiceFile: null,
    });
    order.invoiceNumbers = order.receipts.map((receipt) => receipt.invoiceNumber);

    if (plan.loadNow) {
      this.loadReasons.push(plan.reason);
    }

    const complete = order.items.every((line) => line.pendingQuantity === 0);

    order.status = complete ? 'RECEIVED' : 'PARTIAL';
    order.receivedOn = complete ? plan.receivedOn : null;
    order.pendingLoads = order.receipts.filter((receipt) => receipt.loadedAt === null).length;

    return Promise.resolve(order);
  }

  loadReceipt(orderId: string, receiptId: string, reason: string): Promise<PurchaseOrderDto> {
    const order = this.orderOrThrow(orderId);
    const receipt = order.receipts.find((candidate) => candidate.id === receiptId);

    if (receipt === undefined) {
      throw HttpError.notFound('La entrega no existe.');
    }

    if (receipt.loadedAt !== null) {
      throw HttpError.conflict('Esta entrega ya se cargó al inventario.');
    }

    receipt.loadedAt = new Date().toISOString();
    this.loadReasons.push(reason);
    order.pendingLoads -= 1;

    return Promise.resolve(order);
  }

  close(orderId: string): Promise<PurchaseOrderDto> {
    const order = this.orderOrThrow(orderId);

    if (order.status !== 'PARTIAL') {
      throw HttpError.conflict('Solo se puede concluir un pedido que llegó en parte.');
    }

    order.status = 'RECEIVED';
    order.receivedOn = order.receipts[0]?.receivedOn ?? null;

    return Promise.resolve(order);
  }

  /** Facturas adjuntas, por id de la entrega. */
  readonly invoiceFiles = new Map<string, ReceiptInvoiceFile>();

  setReceiptInvoice(
    orderId: string,
    receiptId: string,
    file: ReceiptInvoiceFile,
  ): Promise<PurchaseOrderDto> {
    const order = this.orderOrThrow(orderId);
    const receipt = order.receipts.find((candidate) => candidate.id === receiptId);

    if (receipt === undefined) {
      throw HttpError.notFound('La entrega no existe.');
    }

    this.invoiceFiles.set(receiptId, file);
    receipt.invoiceFile = {
      name: file.name,
      mimeType: file.mimeType,
      uploadedAt: new Date().toISOString(),
    };

    return Promise.resolve(order);
  }

  findReceiptInvoice(orderId: string, receiptId: string): Promise<ReceiptInvoiceFile | null> {
    this.orderOrThrow(orderId);

    return Promise.resolve(this.invoiceFiles.get(receiptId) ?? null);
  }

  private orderOrThrow(id: string): PurchaseOrderDto {
    const order = this.orders.find((candidate) => candidate.id === id);

    if (order === undefined) {
      throw HttpError.notFound('El pedido no existe.');
    }

    return order;
  }
}
