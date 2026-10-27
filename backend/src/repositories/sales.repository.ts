import { prisma } from '../config/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import type {
  CreateSaleOutcome,
  CreateSalePlan,
  CustomerRef,
  DailySalesSummaryDto,
  PaymentMethodKind,
  SaleAdjustmentOutcome,
  SaleAdjustmentPlan,
  SaleAdjustmentTypeKind,
  SaleListFilter,
  SaleProductDto,
  SaleRecord,
  SaleStatusKind,
  SaleSummaryDto,
} from '../types/sales.js';
import { formatCents, toCents } from '../utils/money.js';

type Money = { toFixed(digits: number): string };

const productSelection = {
  id: true,
  code: true,
  barcode: true,
  name: true,
  price: true,
  stock: true,
  isActive: true,
} as const;

interface ProductRow {
  id: string;
  code: string;
  barcode: string | null;
  name: string;
  price: Money;
  stock: number;
  isActive: boolean;
}

function toProduct(row: ProductRow): SaleProductDto {
  return { ...row, price: row.price.toFixed(2) };
}

const saleSelection = {
  id: true,
  number: true,
  createdAt: true,
  paymentMethod: true,
  status: true,
  total: true,
  cashReceived: true,
  customer: { select: { id: true, name: true } },
  items: {
    select: {
      id: true,
      productId: true,
      quantity: true,
      unitPrice: true,
      product: { select: { code: true, name: true } },
      adjustments: { select: { quantity: true } },
    },
    orderBy: { product: { name: 'asc' } },
  },
  adjustments: {
    select: {
      id: true,
      type: true,
      reason: true,
      total: true,
      createdAt: true,
      items: {
        select: {
          saleItemId: true,
          quantity: true,
          saleItem: { select: { product: { select: { name: true } } } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
} as const;

interface SaleRow {
  id: string;
  number: number;
  createdAt: Date;
  paymentMethod: PaymentMethodKind;
  status: SaleStatusKind;
  total: Money;
  cashReceived: Money | null;
  customer: { id: string; name: string } | null;
  items: {
    id: string;
    productId: string;
    quantity: number;
    unitPrice: Money;
    product: { code: string; name: string };
    adjustments: { quantity: number }[];
  }[];
  adjustments: {
    id: string;
    type: SaleAdjustmentTypeKind;
    reason: string;
    total: Money;
    createdAt: Date;
    items: {
      saleItemId: string;
      quantity: number;
      saleItem: { product: { name: string } };
    }[];
  }[];
}

/** La venta con el precio HISTÓRICO guardado en cada línea (nunca el del catálogo). */
function toSale(row: SaleRow): SaleRecord {
  const items = row.items.map((item) => {
    const unitPrice = item.unitPrice.toFixed(2);
    const returnedQuantity = item.adjustments.reduce(
      (sum, adjustment) => sum + adjustment.quantity,
      0,
    );

    return {
      id: item.id,
      productId: item.productId,
      code: item.product.code,
      name: item.product.name,
      quantity: item.quantity,
      returnedQuantity,
      availableQuantity: item.quantity - returnedQuantity,
      unitPrice,
      subtotal: formatCents(toCents(unitPrice) * BigInt(item.quantity)),
    };
  });
  const originalTotal = items.reduce((sum, item) => sum + toCents(item.subtotal), 0n);

  return {
    id: row.id,
    number: row.number,
    createdAt: row.createdAt.toISOString(),
    paymentMethod: row.paymentMethod,
    status: row.status,
    total: row.total.toFixed(2),
    originalTotal: formatCents(originalTotal),
    cashReceived: row.cashReceived === null ? null : row.cashReceived.toFixed(2),
    customer: row.customer,
    items,
    adjustments: row.adjustments.map((adjustment) => ({
      id: adjustment.id,
      type: adjustment.type,
      reason: adjustment.reason,
      total: adjustment.total.toFixed(2),
      createdAt: adjustment.createdAt.toISOString(),
      items: adjustment.items.map((item) => ({
        saleItemId: item.saleItemId,
        productName: item.saleItem.product.name,
        quantity: item.quantity,
      })),
    })),
  };
}

/** Motivo por el que una línea no se pudo descontar: aborta y revierte la transacción. */
class SaleRejected extends Error {
  constructor(
    readonly reason: 'INSUFFICIENT_STOCK' | 'PRICE_CHANGED' | 'UNAVAILABLE',
    readonly productId: string,
  ) {
    super(reason);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Capa de acceso a datos de las ventas (HU-16, HU-17, HU-18).
 *
 * Sin miembros privados a propósito: el service se prueba con un doble.
 */
export class SalesRepository {
  /** Producto por código interno o código de barras, activo o no (el service decide). */
  async findProductByCode(code: string): Promise<SaleProductDto | null> {
    const row = await prisma.product.findFirst({
      where: { OR: [{ code }, { barcode: code }] },
      select: productSelection,
    });

    return row === null ? null : toProduct(row);
  }

  async findProductsByIds(ids: string[]): Promise<SaleProductDto[]> {
    const rows = await prisma.product.findMany({
      where: { id: { in: ids } },
      select: productSelection,
    });

    return rows.map(toProduct);
  }

  async findCustomerRef(id: string): Promise<CustomerRef | null> {
    return prisma.customer.findUnique({
      where: { id },
      select: { id: true, name: true, isActive: true },
    });
  }

  async findById(id: string): Promise<SaleRecord | null> {
    const row = await prisma.sale.findUnique({ where: { id }, select: saleSelection });

    return row === null ? null : toSale(row);
  }

  async list(filter: SaleListFilter): Promise<SaleSummaryDto[]> {
    const rows = await prisma.sale.findMany({
      where: filter.paymentMethod === undefined ? {} : { paymentMethod: filter.paymentMethod },
      orderBy: { createdAt: 'desc' },
      take: filter.limit,
      select: {
        id: true,
        number: true,
        createdAt: true,
        paymentMethod: true,
        status: true,
        total: true,
        customer: { select: { name: true } },
        _count: { select: { items: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      createdAt: row.createdAt.toISOString(),
      paymentMethod: row.paymentMethod,
      status: row.status,
      total: row.total.toFixed(2),
      customerName: row.customer?.name ?? null,
      itemCount: row._count.items,
    }));
  }

  /** Suma todas las ventas dentro del día indicado, sin límite de filas. */
  async dailySummary(startAt: Date, endAt: Date): Promise<DailySalesSummaryDto> {
    const groups = await prisma.sale.groupBy({
      by: ['paymentMethod'],
      where: { createdAt: { gte: startAt, lt: endAt } },
      _sum: { total: true },
      _count: { _all: true },
    });
    const summary: DailySalesSummaryDto = {
      saleCount: 0,
      total: '0.00',
      cash: '0.00',
      card: '0.00',
      credit: '0.00',
    };
    let totalCents = 0n;

    for (const group of groups) {
      const cents = toCents(group._sum.total?.toFixed(2) ?? '0.00');
      const key = ({ CASH: 'cash', CARD: 'card', CREDIT: 'credit' } as const)[group.paymentMethod];
      totalCents += cents;
      summary.saleCount += group._count._all;
      summary[key] = formatCents(cents);
    }

    summary.total = formatCents(totalCents);

    return summary;
  }

  /** Devuelve unidades y registra el ajuste sin permitir carreras ni duplicar stock. */
  async adjustSale(plan: SaleAdjustmentPlan): Promise<SaleAdjustmentOutcome> {
    return prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Sale" WHERE id = ${plan.saleId}::uuid FOR UPDATE`;

      if (locked.length === 0) {
        return { ok: false, reason: 'NOT_FOUND' };
      }

      const sale = await tx.sale.findUniqueOrThrow({
        where: { id: plan.saleId },
        select: {
          id: true,
          number: true,
          status: true,
          total: true,
          items: {
            select: {
              id: true,
              productId: true,
              quantity: true,
              unitPrice: true,
              adjustments: { select: { quantity: true } },
            },
          },
        },
      });

      if (sale.status === 'VOID') {
        return { ok: false, reason: 'ALREADY_VOID' };
      }

      if (sale.status === 'RETURNED') {
        return { ok: false, reason: 'ALREADY_RETURNED' };
      }

      const remaining = new Map(
        sale.items.map((item) => [
          item.id,
          item.quantity -
            item.adjustments.reduce((sum, adjustment) => sum + adjustment.quantity, 0),
        ]),
      );
      const quantities =
        plan.type === 'VOID'
          ? sale.items
              .map((item) => ({ saleItemId: item.id, quantity: remaining.get(item.id) ?? 0 }))
              .filter((item) => item.quantity > 0)
          : (plan.items ?? []);

      if (quantities.length === 0) {
        return { ok: false, reason: 'ALREADY_RETURNED' };
      }

      const itemsToAdjust: {
        saleItemId: string;
        productId: string;
        quantity: number;
        unitPrice: string;
      }[] = [];
      let totalCents = 0n;

      for (const requested of quantities) {
        const saleItem = sale.items.find((item) => item.id === requested.saleItemId);

        if (saleItem === undefined) {
          return { ok: false, reason: 'INVALID_ITEM' };
        }

        if (requested.quantity > (remaining.get(saleItem.id) ?? 0)) {
          return { ok: false, reason: 'QUANTITY_EXCEEDED' };
        }

        itemsToAdjust.push({
          saleItemId: saleItem.id,
          productId: saleItem.productId,
          quantity: requested.quantity,
          unitPrice: saleItem.unitPrice.toFixed(2),
        });
        totalCents += toCents(saleItem.unitPrice.toFixed(2)) * BigInt(requested.quantity);
      }

      await tx.saleAdjustment.create({
        data: {
          saleId: sale.id,
          type: plan.type,
          reason: plan.reason,
          total: formatCents(totalCents),
          items: {
            create: itemsToAdjust.map((item) => ({
              saleItemId: item.saleItemId,
              quantity: item.quantity,
            })),
          },
        },
        select: { id: true },
      });

      for (const item of itemsToAdjust.sort((left, right) =>
        left.productId.localeCompare(right.productId),
      )) {
        const rows = await tx.$queryRaw<{ stock: number }[]>`
          UPDATE "Product"
          SET stock = stock + ${item.quantity}, "updatedAt" = now()
          WHERE id = ${item.productId}::uuid
          RETURNING stock`;
        const updated = rows[0];

        if (updated === undefined) {
          throw new Error(`No se encontró el producto ${item.productId} al registrar devolución.`);
        }

        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            type: 'ENTRY',
            quantity: item.quantity,
            stockBefore: updated.stock - item.quantity,
            stockAfter: updated.stock,
            reason: `${plan.type === 'VOID' ? 'Anulación' : 'Devolución'} venta #${sale.number}: ${plan.reason}`,
            saleId: sale.id,
          },
        });
      }

      const allReturned = sale.items.every((item) => {
        const returnedBefore = item.quantity - (remaining.get(item.id) ?? 0);
        const newlyReturned =
          itemsToAdjust.find((adjustmentItem) => adjustmentItem.saleItemId === item.id)?.quantity ??
          0;

        return returnedBefore + newlyReturned >= item.quantity;
      });
      const nextStatus =
        plan.type === 'VOID' ? 'VOID' : allReturned ? 'RETURNED' : 'PARTIALLY_RETURNED';
      const nextTotal = toCents(sale.total.toFixed(2)) - totalCents;

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: nextStatus,
          total: formatCents(nextTotal),
        },
      });

      const updatedSale = await tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        select: saleSelection,
      });

      return { ok: true, sale: toSale(updatedSale) };
    });
  }

  /**
   * Confirma la venta en UNA transacción: venta + ítems + descuento de stock +
   * movimientos EXIT. Si cualquier paso falla, todo se revierte.
   *
   * - Stock: `UPDATE … WHERE stock >= cantidad` es atómico; dos ventas del
   *   último producto no pueden dejarlo en negativo (la segunda espera el
   *   bloqueo de la fila, relee el stock y no cumple la condición).
   * - Duplicados: `idempotencyKey` es único. Si la llave ya existe, la venta
   *   original se devuelve (`created: false`) sin descontar de nuevo.
   * - Las líneas se procesan ordenadas por producto para evitar interbloqueos.
   */
  async createSale(plan: CreateSalePlan): Promise<CreateSaleOutcome> {
    try {
      const sale = await prisma.$transaction(async (tx) => {
        const created = await tx.sale.create({
          data: {
            paymentMethod: plan.paymentMethod,
            total: plan.total,
            cashReceived: plan.cashReceived,
            customerId: plan.customerId,
            idempotencyKey: plan.idempotencyKey,
          },
          select: { id: true, number: true },
        });

        for (const item of [...plan.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
          const rows = await tx.$queryRaw<{ stock: number; price: string; cost: string }[]>`
            UPDATE "Product"
            SET stock = stock - ${item.quantity}, "updatedAt" = now()
            WHERE id = ${item.productId}::uuid AND "isActive" = true AND stock >= ${item.quantity}
            RETURNING stock, price::text AS price, cost::text AS cost`;
          const updated = rows[0];

          if (updated === undefined) {
            const current = await tx.product.findUnique({
              where: { id: item.productId },
              select: { isActive: true },
            });

            throw new SaleRejected(
              current?.isActive === true ? 'INSUFFICIENT_STOCK' : 'UNAVAILABLE',
              item.productId,
            );
          }

          if (toCents(updated.price) !== toCents(item.expectedUnitPrice)) {
            throw new SaleRejected('PRICE_CHANGED', item.productId);
          }

          await tx.saleItem.create({
            data: {
              saleId: created.id,
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: updated.price,
              unitCost: updated.cost,
            },
          });
          await tx.inventoryMovement.create({
            data: {
              productId: item.productId,
              type: 'EXIT',
              quantity: item.quantity,
              stockBefore: updated.stock + item.quantity,
              stockAfter: updated.stock,
              reason: `Venta #${created.number}`,
              saleId: created.id,
            },
          });
        }

        return tx.sale.findUniqueOrThrow({ where: { id: created.id }, select: saleSelection });
      });

      return { ok: true, sale: toSale(sale), created: true };
    } catch (error) {
      if (error instanceof SaleRejected) {
        return { ok: false, reason: error.reason, productId: error.productId };
      }

      if (isUniqueViolation(error)) {
        // Reintento de la misma confirmación: se devuelve la venta ya registrada.
        const existing = await prisma.sale.findUnique({
          where: { idempotencyKey: plan.idempotencyKey },
          select: saleSelection,
        });

        if (existing !== null) {
          return { ok: true, sale: toSale(existing), created: false };
        }
      }

      throw error;
    }
  }
}
