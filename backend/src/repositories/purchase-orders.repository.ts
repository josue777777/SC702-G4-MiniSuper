import { prisma } from '../config/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { nextDocumentNumber } from './document-sequence.js';
import type {
  CreatePurchaseOrderPlan,
  PurchaseOrderDto,
  PurchaseOrderStatus,
  PurchaseOrderSummaryDto,
  ReceiveOrderPlan,
  SupplierCatalog,
} from '../types/purchase-orders.js';
import { dateOnlyToDate, dateToDateOnly } from '../utils/dates.js';
import { HttpError } from '../utils/http-error.js';

type Money = { toFixed(digits: number): string };

/** Columnas del historial (HU-22). */
const summarySelection = {
  id: true,
  number: true,
  status: true,
  total: true,
  createdAt: true,
  receivedAt: true,
  supplier: { select: { id: true, name: true } },
  items: { select: { product: { select: { name: true } } }, orderBy: { product: { name: 'asc' } } },
  _count: { select: { receipts: { where: { loadedAt: null } } } },
} as const;

/** Entregas: la más reciente primero (por el día en que llegaron). */
const receiptsOrder: Prisma.PurchaseReceiptOrderByWithRelationInput[] = [
  { receivedOn: 'desc' },
  { createdAt: 'desc' },
];

/** Columnas del detalle y del PDF (HU-24). */
const detailSelection = {
  id: true,
  number: true,
  status: true,
  total: true,
  notes: true,
  createdAt: true,
  receivedAt: true,
  supplier: { select: { id: true, name: true, phone: true, email: true } },
  items: {
    select: {
      productId: true,
      quantity: true,
      unitCost: true,
      receivedQuantity: true,
      product: { select: { code: true, name: true } },
    },
    orderBy: { product: { name: 'asc' } },
  },
  receipts: {
    select: {
      id: true,
      invoiceNumber: true,
      receivedOn: true,
      loadedAt: true,
      createdAt: true,
      items: {
        select: {
          productId: true,
          quantity: true,
          product: { select: { code: true, name: true } },
        },
        orderBy: { product: { name: 'asc' } },
      },
    },
    orderBy: receiptsOrder,
  },
  _count: { select: { receipts: { where: { loadedAt: null } } } },
} as const;

interface SummaryRow {
  id: string;
  number: number;
  status: PurchaseOrderStatus;
  total: Money;
  createdAt: Date;
  receivedAt: Date | null;
  supplier: { id: string; name: string };
  items: { product: { name: string } }[];
  _count: { receipts: number };
}

interface DetailRow {
  id: string;
  number: number;
  status: PurchaseOrderStatus;
  total: Money;
  notes: string | null;
  createdAt: Date;
  receivedAt: Date | null;
  supplier: { id: string; name: string; phone: string | null; email: string | null };
  items: {
    productId: string;
    quantity: number;
    unitCost: Money;
    receivedQuantity: number;
    product: { code: string; name: string };
  }[];
  receipts: {
    id: string;
    invoiceNumber: string;
    receivedOn: Date;
    loadedAt: Date | null;
    createdAt: Date;
    items: { productId: string; quantity: number; product: { code: string; name: string } }[];
  }[];
  _count: { receipts: number };
}

function toSummaryDto(row: SummaryRow): PurchaseOrderSummaryDto {
  return {
    id: row.id,
    number: row.number,
    supplierId: row.supplier.id,
    supplierName: row.supplier.name,
    status: row.status,
    total: row.total.toFixed(2),
    itemCount: row.items.length,
    productNames: row.items.map((item) => item.product.name),
    createdAt: row.createdAt.toISOString(),
    receivedOn: row.receivedAt === null ? null : dateToDateOnly(row.receivedAt),
    pendingLoads: row._count.receipts,
  };
}

function toDetailDto(row: DetailRow): PurchaseOrderDto {
  return {
    id: row.id,
    number: row.number,
    supplierId: row.supplier.id,
    supplierName: row.supplier.name,
    supplierPhone: row.supplier.phone,
    supplierEmail: row.supplier.email,
    status: row.status,
    total: row.total.toFixed(2),
    itemCount: row.items.length,
    productNames: row.items.map((item) => item.product.name),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    receivedOn: row.receivedAt === null ? null : dateToDateOnly(row.receivedAt),
    pendingLoads: row._count.receipts,
    receipts: row.receipts.map((receipt) => ({
      id: receipt.id,
      invoiceNumber: receipt.invoiceNumber,
      receivedOn: dateToDateOnly(receipt.receivedOn),
      loadedAt: receipt.loadedAt === null ? null : receipt.loadedAt.toISOString(),
      createdAt: receipt.createdAt.toISOString(),
      items: receipt.items.map((item) => ({
        productId: item.productId,
        productCode: item.product.code,
        productName: item.product.name,
        quantity: item.quantity,
      })),
    })),
    items: row.items.map((item) => {
      const unitCost = item.unitCost.toFixed(2);

      return {
        productId: item.productId,
        productCode: item.product.code,
        productName: item.product.name,
        quantity: item.quantity,
        unitCost,
        subtotal: ((Math.round(Number(unitCost) * 100) * item.quantity) / 100).toFixed(2),
        receivedQuantity: item.receivedQuantity,
        pendingQuantity: Math.max(0, item.quantity - item.receivedQuantity),
      };
    }),
  };
}

type Tx = Prisma.TransactionClient;

/**
 * Suma al stock lo que trae una entrega y deja una entrada (ENTRY) por producto
 * en el Kardex, con la factura en el motivo. Marca la entrega como cargada SOLO
 * si seguía pendiente: si dos personas confirman a la vez, la segunda no suma
 * dos veces (responde 409).
 */
async function loadReceiptStock(
  tx: Tx,
  businessId: string,
  receiptId: string,
  reason: string,
): Promise<void> {
  const marked = await tx.purchaseReceipt.updateMany({
    where: { id: receiptId, loadedAt: null, purchaseOrder: { businessId } },
    data: { loadedAt: new Date() },
  });

  if (marked.count === 0) {
    throw HttpError.conflict('Esta entrega ya se cargó al inventario.');
  }

  const receipt = await tx.purchaseReceipt.findUniqueOrThrow({
    where: { id: receiptId },
    select: { purchaseOrderId: true, items: { select: { productId: true, quantity: true } } },
  });

  for (const item of receipt.items) {
    const product = await tx.product.update({
      where: { id: item.productId, businessId },
      data: { stock: { increment: item.quantity } },
      select: { stock: true },
    });

    await tx.inventoryMovement.create({
      data: {
        productId: item.productId,
        type: 'ENTRY',
        quantity: item.quantity,
        stockBefore: product.stock - item.quantity,
        stockAfter: product.stock,
        reason,
        purchaseOrderId: receipt.purchaseOrderId,
        receiptId,
      },
    });
  }
}

/**
 * Acceso a datos de pedidos a proveedor (HU-22, HU-24). Única capa que usa
 * Prisma; sin miembros privados para sustituirla por un doble en las pruebas.
 * Atada a UN negocio: sus proveedores, productos y pedidos (ADR 0002).
 */
export class PurchaseOrdersRepository {
  constructor(readonly businessId: string) {}

  /**
   * Proveedor activo con los productos ACTIVOS que suministra y su costo, o
   * `null` si el proveedor no existe o está inactivo.
   */
  async findSupplierCatalog(supplierId: string): Promise<SupplierCatalog | null> {
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, businessId: this.businessId, isActive: true },
      select: {
        id: true,
        products: {
          where: { product: { isActive: true, businessId: this.businessId } },
          select: { productId: true, unitCost: true, product: { select: { name: true } } },
        },
      },
    });

    if (supplier === null) {
      return null;
    }

    return {
      supplierId: supplier.id,
      products: supplier.products.map((item) => ({
        productId: item.productId,
        productName: item.product.name,
        unitCost: item.unitCost.toFixed(2),
      })),
    };
  }

  /**
   * Guarda el pedido con sus líneas y su consecutivo del negocio en una sola
   * transacción: si algo falla, ni el pedido ni el número quedan gastados.
   */
  async create(plan: CreatePurchaseOrderPlan): Promise<PurchaseOrderDto> {
    const row = await prisma.$transaction(async (tx) =>
      tx.purchaseOrder.create({
        data: {
          businessId: this.businessId,
          number: await nextDocumentNumber(tx, this.businessId, 'PURCHASE_ORDER'),
          supplierId: plan.supplierId,
          notes: plan.notes,
          total: plan.total,
          items: { create: plan.items },
        },
        select: detailSelection,
      }),
    );

    return toDetailDto(row);
  }

  /** Historial, del más reciente al más antiguo; opcionalmente de un solo proveedor (HU-22). */
  async list(supplierId?: string): Promise<PurchaseOrderSummaryDto[]> {
    const rows = await prisma.purchaseOrder.findMany({
      where: {
        businessId: this.businessId,
        ...(supplierId === undefined ? {} : { supplierId }),
      },
      select: summarySelection,
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(toSummaryDto);
  }

  /** Detalle de un pedido, o `null` si no existe. */
  async findById(id: string): Promise<PurchaseOrderDto | null> {
    const row = await prisma.purchaseOrder.findFirst({
      where: { id, businessId: this.businessId },
      select: detailSelection,
    });

    return row === null ? null : toDetailDto(row);
  }

  /**
   * Registra una entrega (HU-38) en una sola transacción: la factura, lo que
   * llegó, lo recibido de cada línea y el estado del pedido; y, si `loadNow`,
   * también el stock y sus entradas en el Kardex.
   *
   * Cada línea se actualiza solo si nadie la cambió desde que se leyó: dos
   * recepciones a la vez no pueden pasarse de lo pedido (la segunda da 409).
   */
  async receive(orderId: string, plan: ReceiveOrderPlan): Promise<PurchaseOrderDto> {
    try {
      await prisma.$transaction(async (tx) => {
        const order = await tx.purchaseOrder.findFirst({
          where: { id: orderId, businessId: this.businessId },
          select: {
            status: true,
            items: {
              select: { id: true, productId: true, quantity: true, receivedQuantity: true },
            },
          },
        });

        if (order === null) {
          throw HttpError.notFound('El pedido no existe.');
        }

        if (order.status === 'RECEIVED') {
          throw HttpError.conflict('El pedido ya está cerrado.');
        }

        const lines = new Map(order.items.map((item) => [item.productId, item]));

        for (const item of plan.items) {
          const line = lines.get(item.productId);

          if (line === undefined || line.receivedQuantity + item.quantity > line.quantity) {
            throw HttpError.conflict(
              'El pedido cambió mientras se registraba la entrega. Ábralo de nuevo.',
            );
          }

          const changed = await tx.purchaseOrderItem.updateMany({
            where: { id: line.id, receivedQuantity: line.receivedQuantity },
            data: { receivedQuantity: line.receivedQuantity + item.quantity },
          });

          if (changed.count === 0) {
            throw HttpError.conflict(
              'El pedido cambió mientras se registraba la entrega. Ábralo de nuevo.',
            );
          }

          line.receivedQuantity += item.quantity;
        }

        const receipt = await tx.purchaseReceipt.create({
          data: {
            purchaseOrderId: orderId,
            invoiceNumber: plan.invoiceNumber,
            receivedOn: dateOnlyToDate(plan.receivedOn),
            items: { create: plan.items },
          },
          select: { id: true },
        });
        const complete = [...lines.values()].every(
          (line) => line.receivedQuantity >= line.quantity,
        );

        await tx.purchaseOrder.update({
          where: { id: orderId },
          data: complete
            ? { status: 'RECEIVED', receivedAt: dateOnlyToDate(plan.receivedOn) }
            : { status: 'PARTIAL' },
        });

        if (plan.loadNow) {
          await loadReceiptStock(tx, this.businessId, receipt.id, plan.reason);
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw HttpError.conflict('Esa factura ya está registrada en este pedido.', {
          invoiceNumber: ['Esa factura ya está registrada en este pedido.'],
        });
      }

      throw error;
    }

    return found(await this.findById(orderId));
  }

  /** Carga al inventario una entrega que había quedado pendiente (HU-38). */
  async loadReceipt(orderId: string, receiptId: string, reason: string): Promise<PurchaseOrderDto> {
    await prisma.$transaction(async (tx) => {
      const receipt = await tx.purchaseReceipt.findFirst({
        where: {
          id: receiptId,
          purchaseOrderId: orderId,
          purchaseOrder: { businessId: this.businessId },
        },
        select: { id: true },
      });

      if (receipt === null) {
        throw HttpError.notFound('La entrega no existe.');
      }

      await loadReceiptStock(tx, this.businessId, receiptId, reason);
    });

    return found(await this.findById(orderId));
  }

  /**
   * Da por concluido un pedido que llegó en parte (HU-38): lo que faltó ya no
   * se espera. Queda con la fecha de su última entrega.
   */
  async close(orderId: string): Promise<PurchaseOrderDto> {
    const last = await prisma.purchaseReceipt.findFirst({
      where: { purchaseOrderId: orderId, purchaseOrder: { businessId: this.businessId } },
      select: { receivedOn: true },
      orderBy: { receivedOn: 'desc' },
    });
    const closed = await prisma.purchaseOrder.updateMany({
      where: { id: orderId, businessId: this.businessId, status: 'PARTIAL' },
      data: { status: 'RECEIVED', receivedAt: last?.receivedOn ?? new Date() },
    });

    if (closed.count === 0) {
      throw HttpError.conflict('Solo se puede concluir un pedido que llegó en parte.');
    }

    return found(await this.findById(orderId));
  }
}

/** El detalle recién guardado; si no aparece (otro negocio o borrado), 404. */
function found(order: PurchaseOrderDto | null): PurchaseOrderDto {
  if (order === null) {
    throw HttpError.notFound('El pedido no existe.');
  }

  return order;
}
