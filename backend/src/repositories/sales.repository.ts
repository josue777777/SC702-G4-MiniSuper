import { prisma } from '../config/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import type {
  CreateSaleOutcome,
  CreateSalePlan,
  CustomerRef,
  PaymentMethodKind,
  SaleListFilter,
  SaleProductDto,
  SaleRecord,
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
  total: true,
  cashReceived: true,
  customer: { select: { id: true, name: true } },
  items: {
    select: {
      productId: true,
      quantity: true,
      unitPrice: true,
      product: { select: { code: true, name: true } },
    },
    orderBy: { product: { name: 'asc' } },
  },
} as const;

interface SaleRow {
  id: string;
  number: number;
  createdAt: Date;
  paymentMethod: PaymentMethodKind;
  total: Money;
  cashReceived: Money | null;
  customer: { id: string; name: string } | null;
  items: {
    productId: string;
    quantity: number;
    unitPrice: Money;
    product: { code: string; name: string };
  }[];
}

/** La venta con el precio HISTÓRICO guardado en cada línea (nunca el del catálogo). */
function toSale(row: SaleRow): SaleRecord {
  return {
    id: row.id,
    number: row.number,
    createdAt: row.createdAt.toISOString(),
    paymentMethod: row.paymentMethod,
    total: row.total.toFixed(2),
    cashReceived: row.cashReceived === null ? null : row.cashReceived.toFixed(2),
    customer: row.customer,
    items: row.items.map((item) => {
      const unitPrice = item.unitPrice.toFixed(2);

      return {
        productId: item.productId,
        code: item.product.code,
        name: item.product.name,
        quantity: item.quantity,
        unitPrice,
        subtotal: formatCents(toCents(unitPrice) * BigInt(item.quantity)),
      };
    }),
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
      total: row.total.toFixed(2),
      customerName: row.customer?.name ?? null,
      itemCount: row._count.items,
    }));
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
