import type { PurchaseOrdersRepository } from '../repositories/purchase-orders.repository.js';
import type {
  CreatePurchaseOrderPlan,
  PurchaseOrderDto,
  PurchaseOrderSummaryDto,
  SupplierCatalog,
} from '../types/purchase-orders.js';
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
      })),
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
        }))
        .reverse(),
    );
  }

  findById(id: string): Promise<PurchaseOrderDto | null> {
    return Promise.resolve(this.orders.find((order) => order.id === id) ?? null);
  }
}
