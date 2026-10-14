import { prisma } from '../config/prisma.js';
import type {
  CreatePurchaseOrderPlan,
  PurchaseOrderDto,
  PurchaseOrderSummaryDto,
  SupplierCatalog,
} from '../types/purchase-orders.js';

type Money = { toFixed(digits: number): string };

/** Columnas del historial (HU-22). */
const summarySelection = {
  id: true,
  status: true,
  total: true,
  createdAt: true,
  supplier: { select: { id: true, name: true } },
  items: { select: { product: { select: { name: true } } }, orderBy: { product: { name: 'asc' } } },
} as const;

/** Columnas del detalle y del PDF (HU-24). */
const detailSelection = {
  id: true,
  status: true,
  total: true,
  notes: true,
  createdAt: true,
  supplier: { select: { id: true, name: true, phone: true, email: true } },
  items: {
    select: {
      productId: true,
      quantity: true,
      unitCost: true,
      product: { select: { code: true, name: true } },
    },
    orderBy: { product: { name: 'asc' } },
  },
} as const;

interface SummaryRow {
  id: string;
  status: 'PENDING' | 'RECEIVED';
  total: Money;
  createdAt: Date;
  supplier: { id: string; name: string };
  items: { product: { name: string } }[];
}

interface DetailRow {
  id: string;
  status: 'PENDING' | 'RECEIVED';
  total: Money;
  notes: string | null;
  createdAt: Date;
  supplier: { id: string; name: string; phone: string | null; email: string | null };
  items: {
    productId: string;
    quantity: number;
    unitCost: Money;
    product: { code: string; name: string };
  }[];
}

function toSummaryDto(row: SummaryRow): PurchaseOrderSummaryDto {
  return {
    id: row.id,
    supplierId: row.supplier.id,
    supplierName: row.supplier.name,
    status: row.status,
    total: row.total.toFixed(2),
    itemCount: row.items.length,
    productNames: row.items.map((item) => item.product.name),
    createdAt: row.createdAt.toISOString(),
  };
}

function toDetailDto(row: DetailRow): PurchaseOrderDto {
  return {
    id: row.id,
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
    items: row.items.map((item) => {
      const unitCost = item.unitCost.toFixed(2);

      return {
        productId: item.productId,
        productCode: item.product.code,
        productName: item.product.name,
        quantity: item.quantity,
        unitCost,
        subtotal: ((Math.round(Number(unitCost) * 100) * item.quantity) / 100).toFixed(2),
      };
    }),
  };
}

/**
 * Acceso a datos de pedidos a proveedor (HU-22, HU-24). Única capa que usa
 * Prisma; sin miembros privados para sustituirla por un doble en las pruebas.
 */
export class PurchaseOrdersRepository {
  /**
   * Proveedor activo con los productos ACTIVOS que suministra y su costo, o
   * `null` si el proveedor no existe o está inactivo.
   */
  async findSupplierCatalog(supplierId: string): Promise<SupplierCatalog | null> {
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, isActive: true },
      select: {
        id: true,
        products: {
          where: { product: { isActive: true } },
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

  /** Guarda el pedido con sus líneas en una sola operación (creación anidada). */
  async create(plan: CreatePurchaseOrderPlan): Promise<PurchaseOrderDto> {
    const row = await prisma.purchaseOrder.create({
      data: {
        supplierId: plan.supplierId,
        notes: plan.notes,
        total: plan.total,
        items: { create: plan.items },
      },
      select: detailSelection,
    });

    return toDetailDto(row);
  }

  /** Historial, del más reciente al más antiguo; opcionalmente de un solo proveedor (HU-22). */
  async list(supplierId?: string): Promise<PurchaseOrderSummaryDto[]> {
    const rows = await prisma.purchaseOrder.findMany({
      where: supplierId === undefined ? {} : { supplierId },
      select: summarySelection,
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(toSummaryDto);
  }

  /** Detalle de un pedido, o `null` si no existe. */
  async findById(id: string): Promise<PurchaseOrderDto | null> {
    const row = await prisma.purchaseOrder.findUnique({ where: { id }, select: detailSelection });

    return row === null ? null : toDetailDto(row);
  }
}
