import { prisma } from '../config/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import type {
  CreateSaleOutcome,
  CreateSalePlan,
  CustomerRef,
  DailySalesSummaryDto,
  DailySalesHistoryDto,
  DailySalesHistoryFilter,
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
import { nextDocumentNumber } from './document-sequence.js';

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
 * Atada a UN negocio (multi-negocio, ADR 0002): solo vende, consulta y ajusta
 * ventas y productos de ese negocio. En el SQL directo el negocio va dentro del
 * mismo `UPDATE`, así un id de otro negocio no descuenta nada.
 *
 * Sin miembros privados a propósito: el service se prueba con un doble.
 */
export class SalesRepository {
  constructor(readonly businessId: string) {}

  /** Producto por código interno o código de barras, activo o no (el service decide). */
  async findProductByCode(code: string): Promise<SaleProductDto | null> {
    const row = await prisma.product.findFirst({
      where: { businessId: this.businessId, OR: [{ code }, { barcode: code }] },
      select: productSelection,
    });

    return row === null ? null : toProduct(row);
  }

  /** Productos ACTIVOS del negocio cuyo nombre, código o código de barras contiene el texto. */
  async searchSellableProducts(term: string, limit: number): Promise<SaleProductDto[]> {
    const rows = await prisma.product.findMany({
      where: {
        businessId: this.businessId,
        isActive: true,
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { code: { contains: term, mode: 'insensitive' } },
          { barcode: { contains: term } },
        ],
      },
      orderBy: { name: 'asc' },
      take: limit,
      select: productSelection,
    });

    return rows.map(toProduct);
  }

  async findProductsByIds(ids: string[]): Promise<SaleProductDto[]> {
    const rows = await prisma.product.findMany({
      where: { id: { in: ids }, businessId: this.businessId },
      select: productSelection,
    });

    return rows.map(toProduct);
  }

  async findCustomerRef(id: string): Promise<CustomerRef | null> {
    return prisma.customer.findFirst({
      where: { id, businessId: this.businessId },
      select: { id: true, name: true, isActive: true },
    });
  }

  async findById(id: string): Promise<SaleRecord | null> {
    const row = await prisma.sale.findFirst({
      where: { id, businessId: this.businessId },
      select: saleSelection,
    });

    return row === null ? null : toSale(row);
  }

  async list(filter: SaleListFilter): Promise<SaleSummaryDto[]> {
    const rows = await prisma.sale.findMany({
      where: {
        businessId: this.businessId,
        ...(filter.paymentMethod === undefined ? {} : { paymentMethod: filter.paymentMethod }),
      },
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

  async dailyHistory(
    startAt: Date,
    endAt: Date,
    filter: DailySalesHistoryFilter,
  ): Promise<Pick<DailySalesHistoryDto, 'sales' | 'matchingCount' | 'day'>> {
    const dayWhere = { businessId: this.businessId, createdAt: { gte: startAt, lt: endAt } };
    const where = {
      ...dayWhere,
      ...(filter.paymentMethod === undefined ? {} : { paymentMethod: filter.paymentMethod }),
    };
    // Filas y agregados deben observar el mismo estado aun si otra caja vende o devuelve.
    const [rows, matchingCount, day, adjustments] = await prisma.$transaction(
      [
        prisma.sale.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { number: 'desc' }],
          skip: (filter.page - 1) * filter.pageSize,
          take: filter.pageSize,
          select: saleSelection,
        }),
        prisma.sale.count({ where }),
        prisma.sale.aggregate({ where: dayWhere, _sum: { total: true }, _count: { _all: true } }),
        prisma.saleAdjustment.aggregate({
          where: { sale: dayWhere },
          _sum: { total: true },
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const total = day._sum.total?.toFixed(2) ?? '0.00';
    // HU-35 conserva el neto en Sale.total (cero al anular) y cada rebaja en los ajustes.
    const originalTotal = formatCents(
      toCents(total) + toCents(adjustments._sum.total?.toFixed(2) ?? '0.00'),
    );

    return {
      sales: rows.map(toSale),
      matchingCount,
      day: { saleCount: day._count._all, originalTotal, total },
    };
  }

  /** Suma todas las ventas dentro del día indicado, sin límite de filas. */
  async dailySummary(startAt: Date, endAt: Date): Promise<DailySalesSummaryDto> {
    const groups = await prisma.sale.groupBy({
      by: ['paymentMethod'],
      where: { businessId: this.businessId, createdAt: { gte: startAt, lt: endAt } },
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
      // Un fiado cambia la deuda del cliente: se bloquea PRIMERO al cliente y después la venta,
      // el mismo orden con que se registra un abono (HU-19), para que ambos se hagan uno a la vez.
      const owner = await tx.sale.findFirst({
        where: { id: plan.saleId, businessId: this.businessId },
        select: { customerId: true, paymentMethod: true },
      });

      if (owner?.paymentMethod === 'CREDIT' && owner.customerId !== null) {
        await tx.$queryRaw`
          SELECT id FROM "Customer"
          WHERE id = ${owner.customerId}::uuid AND "businessId" = ${this.businessId}::uuid
          FOR UPDATE`;
      }

      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Sale"
        WHERE id = ${plan.saleId}::uuid AND "businessId" = ${this.businessId}::uuid
        FOR UPDATE`;

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
          paymentMethod: true,
          customerId: true,
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

      // Un fiado con abonos (HU-19) no puede quedar con más abonado que su nuevo importe: no existe
      // devolución de dinero ni saldo a favor. Se rechaza SIN escribir nada, con las cifras reales.
      if (sale.paymentMethod === 'CREDIT' && sale.customerId !== null) {
        const [salePaid, customerCredited, customerPaid] = await Promise.all([
          tx.creditPayment.aggregate({ where: { saleId: sale.id }, _sum: { amount: true } }),
          tx.sale.aggregate({
            where: {
              businessId: this.businessId,
              customerId: sale.customerId,
              paymentMethod: 'CREDIT',
            },
            _sum: { total: true },
          }),
          tx.creditPayment.aggregate({
            where: { customerId: sale.customerId },
            _sum: { amount: true },
          }),
        ]);
        const effectiveAfter = toCents(sale.total.toFixed(2)) - totalCents;
        const assigned = toCents(salePaid._sum.amount?.toFixed(2) ?? '0.00');
        // Abonos anteriores a HU-19 (sin venta) también cuentan contra lo que el cliente debe.
        const balanceAfter =
          toCents(customerCredited._sum.total?.toFixed(2) ?? '0.00') -
          totalCents -
          toCents(customerPaid._sum.amount?.toFixed(2) ?? '0.00');

        if (assigned > effectiveAfter) {
          return {
            ok: false,
            reason: 'PAID_EXCEEDS',
            scope: 'SALE',
            number: sale.number,
            paid: formatCents(assigned),
            remaining: formatCents(effectiveAfter),
          };
        }

        if (balanceAfter < 0n) {
          return {
            ok: false,
            reason: 'PAID_EXCEEDS',
            scope: 'CUSTOMER',
            number: sale.number,
            paid: formatCents(toCents(customerPaid._sum.amount?.toFixed(2) ?? '0.00')),
            remaining: formatCents(
              toCents(customerCredited._sum.total?.toFixed(2) ?? '0.00') - totalCents,
            ),
          };
        }
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
          WHERE id = ${item.productId}::uuid AND "businessId" = ${this.businessId}::uuid
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
   * - Duplicados: `idempotencyKey` es único por negocio. Si la llave ya
   *   existe, la venta original se devuelve (`created: false`) sin descontar
   *   de nuevo.
   * - Número: el consecutivo del negocio se toma en la misma transacción; si
   *   la venta no se guarda, el número no se gasta.
   * - Las líneas se procesan ordenadas por producto para evitar interbloqueos.
   */
  async createSale(plan: CreateSalePlan): Promise<CreateSaleOutcome> {
    try {
      const sale = await prisma.$transaction(async (tx) => {
        const created = await tx.sale.create({
          data: {
            businessId: this.businessId,
            number: await nextDocumentNumber(tx, this.businessId, 'SALE'),
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
            WHERE id = ${item.productId}::uuid AND "businessId" = ${this.businessId}::uuid
              AND "isActive" = true AND stock >= ${item.quantity}
            RETURNING stock, price::text AS price, cost::text AS cost`;
          const updated = rows[0];

          if (updated === undefined) {
            const current = await tx.product.findFirst({
              where: { id: item.productId, businessId: this.businessId },
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
        const existing = await prisma.sale.findFirst({
          where: { idempotencyKey: plan.idempotencyKey, businessId: this.businessId },
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
