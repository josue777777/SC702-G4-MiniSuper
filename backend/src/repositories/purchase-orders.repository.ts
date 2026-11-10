import { prisma } from '../config/prisma.js';
import { nextDocumentNumber } from './document-sequence.js';
import type {
  CreatePurchaseOrderPlan,
  PurchaseOrderDto,
  PurchaseOrderSummaryDto,
  RestockCandidate,
  SupplierCatalog,
} from '../types/purchase-orders.js';

type Money = { toFixed(digits: number): string };

/** Columnas del historial (HU-22). */
const summarySelection = {
  id: true,
  number: true,
  status: true,
  total: true,
  createdAt: true,
  supplier: { select: { id: true, name: true } },
  items: { select: { product: { select: { name: true } } }, orderBy: { product: { name: 'asc' } } },
} as const;

/** Columnas del detalle y del PDF (HU-24). */
const detailSelection = {
  id: true,
  number: true,
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
  number: number;
  status: 'PENDING' | 'RECEIVED';
  total: Money;
  createdAt: Date;
  supplier: { id: string; name: string };
  items: { product: { name: string } }[];
}

interface DetailRow {
  id: string;
  number: number;
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
    number: row.number,
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
   * HU-23 — productos activos con stock en o bajo su mínimo (`minStock > 0`),
   * con sus proveedores activos y lo que ya viene en pedidos pendientes. El
   * filtro `stock <= minStock` lo resuelve la base, sin traer todo el catálogo.
   */
  async listRestockCandidates(): Promise<RestockCandidate[]> {
    const products = await prisma.product.findMany({
      where: {
        businessId: this.businessId,
        isActive: true,
        minStock: { gt: 0 },
        stock: { lte: prisma.product.fields.minStock },
      },
      select: {
        id: true,
        code: true,
        name: true,
        stock: true,
        minStock: true,
        supplierProducts: {
          where: { supplier: { isActive: true, businessId: this.businessId } },
          select: {
            supplierId: true,
            unitCost: true,
            isPreferred: true,
            supplier: { select: { name: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    if (products.length === 0) {
      return [];
    }

    const pendingItems = await prisma.purchaseOrderItem.findMany({
      where: {
        productId: { in: products.map((product) => product.id) },
        purchaseOrder: { businessId: this.businessId, status: 'PENDING' },
      },
      select: { productId: true, quantity: true, receivedQuantity: true },
    });
    const pending = new Map<string, number>();

    for (const item of pendingItems) {
      const outstanding = Math.max(0, item.quantity - item.receivedQuantity);
      pending.set(item.productId, (pending.get(item.productId) ?? 0) + outstanding);
    }

    return products.map((product) => ({
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      stock: product.stock,
      minStock: product.minStock,
      pendingQuantity: pending.get(product.id) ?? 0,
      suppliers: product.supplierProducts.map((item) => ({
        supplierId: item.supplierId,
        supplierName: item.supplier.name,
        unitCost: item.unitCost.toFixed(2),
        isPreferred: item.isPreferred,
      })),
    }));
  }
}
