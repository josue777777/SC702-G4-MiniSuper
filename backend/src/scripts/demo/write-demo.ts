import type { PrismaClient } from '../../generated/prisma/client.js';
import { formatCents } from '../../utils/money.js';
import type { DemoPlan } from './generate-demo.js';

/**
 * Guarda en PostgreSQL el plan de `generate-demo.ts` como un negocio aparte,
 * «Minisúper Demo». Nunca toca los demás negocios: todo cuelga de
 * `DEMO_BUSINESS_ID`, y si el demo ya existía se borra completo y se vuelve a
 * crear (así el comando se puede correr las veces que haga falta).
 */

/** Id fijo del negocio de demostración: así se encuentra para borrarlo y rehacerlo. */
export const DEMO_BUSINESS_ID = 'de300000-0000-4000-8000-000000000001';

/** Usuarios de prueba: uno por rol del negocio. Entran con DEMO_PASSWORD. */
export const DEMO_USERS = [
  { username: 'demo.encargado', name: 'Encargada Demo', role: 'ENCARGADO' },
  { username: 'demo.cajero', name: 'Cajero Demo', role: 'CAJERO' },
  { username: 'demo.bodega', name: 'Bodega Demo', role: 'BODEGA' },
] as const;

/** Cuántas filas se insertan por consulta: miles de una vez no caben en un solo INSERT. */
const CHUNK = 1_000;

/** Céntimos → texto con 2 decimales, como guarda la base (`Decimal(12, 2)`). */
const money = (cents: number): string => formatCents(BigInt(cents));

async function inChunks<T>(rows: readonly T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let start = 0; start < rows.length; start += CHUNK) {
    await insert(rows.slice(start, start + CHUNK));
  }
}

/**
 * Borra el negocio de demostración y todo lo suyo, en el orden que piden las
 * llaves foráneas (primero lo que apunta a otras tablas).
 *
 * @returns `true` si existía.
 */
export async function removeDemo(prisma: PrismaClient): Promise<boolean> {
  const business = { businessId: DEMO_BUSINESS_ID };
  const exists = await prisma.business.findUnique({ where: { id: DEMO_BUSINESS_ID } });

  if (exists === null) {
    return false;
  }

  await prisma.$transaction(
    [
      prisma.creditPayment.deleteMany({ where: { customer: business } }),
      prisma.saleAdjustmentItem.deleteMany({ where: { adjustment: { sale: business } } }),
      prisma.saleAdjustment.deleteMany({ where: { sale: business } }),
      prisma.inventoryMovement.deleteMany({ where: { product: business } }),
      prisma.saleItem.deleteMany({ where: { sale: business } }),
      prisma.sale.deleteMany({ where: business }),
      prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrder: business } }),
      prisma.purchaseOrder.deleteMany({ where: business }),
      prisma.supplierProduct.deleteMany({ where: { supplier: business } }),
      prisma.supplier.deleteMany({ where: business }),
      prisma.product.deleteMany({ where: business }),
      prisma.category.deleteMany({ where: business }),
      prisma.customer.deleteMany({ where: business }),
      prisma.documentSequence.deleteMany({ where: business }),
      prisma.accessEvent.deleteMany({ where: { OR: [business, { user: business }] } }),
      prisma.planRequest.deleteMany({ where: business }),
      prisma.userPreferences.deleteMany({ where: { user: business } }),
      prisma.user.deleteMany({ where: business }),
      prisma.business.delete({ where: { id: DEMO_BUSINESS_ID } }),
    ],
    { timeout: 120_000 },
  );

  return true;
}

/**
 * Crea el negocio de demostración con todo el plan.
 *
 * @param prisma Cliente de Prisma.
 * @param plan Lo que armó `generateDemo`.
 * @param passwordHash Hash argon2 de DEMO_PASSWORD (la contraseña nunca llega aquí en claro).
 */
export async function writeDemo(
  prisma: PrismaClient,
  plan: DemoPlan,
  passwordHash: string,
): Promise<void> {
  const businessId = DEMO_BUSINESS_ID;

  await removeDemo(prisma);
  await prisma.business.create({
    data: {
      id: businessId,
      name: 'Minisúper Demo',
      phone: '2222-0000',
      email: 'contacto@minisuper-demo.example.com',
      address: 'San José, Costa Rica (datos de prueba)',
      receiptMessage: '¡Gracias por su compra! (negocio de demostración)',
      // El Encargado + 4: hay lugar para crear usuarios al probar.
      extraUsers: 4,
    },
  });
  await prisma.user.createMany({
    data: DEMO_USERS.map((user) => ({
      businessId,
      name: user.name,
      username: user.username,
      email: `${user.username}@example.com`,
      passwordHash,
      role: user.role,
    })),
  });

  await prisma.category.createMany({
    data: plan.categories.map((category) => ({ ...category, businessId })),
  });
  await inChunks(plan.products, (chunk) =>
    prisma.product.createMany({
      data: chunk.map((product) => ({
        id: product.id,
        businessId,
        code: product.code,
        barcode: product.barcode,
        name: product.name,
        categoryId: product.categoryId,
        price: money(product.priceCents),
        cost: money(product.costCents),
        stock: product.stock,
        minStock: product.minStock,
        expirationDate: product.expirationDate,
        isActive: product.isActive,
        createdAt: product.createdAt,
      })),
    }),
  );
  await prisma.supplier.createMany({
    data: plan.suppliers.map((supplier) => ({ ...supplier, businessId })),
  });
  await inChunks(plan.supplierProducts, (chunk) =>
    prisma.supplierProduct.createMany({
      data: chunk.map((link) => ({
        supplierId: link.supplierId,
        productId: link.productId,
        unitCost: money(link.unitCostCents),
        isPreferred: link.isPreferred,
      })),
    }),
  );
  await prisma.customer.createMany({
    data: plan.customers.map((customer) => ({ ...customer, businessId })),
  });

  await inChunks(plan.sales, (chunk) =>
    prisma.sale.createMany({
      data: chunk.map((sale) => ({
        id: sale.id,
        businessId,
        number: sale.number,
        paymentMethod: sale.paymentMethod,
        status: sale.status,
        total: money(sale.totalCents),
        customerId: sale.customerId,
        cashReceived: sale.cashReceivedCents === null ? null : money(sale.cashReceivedCents),
        createdAt: sale.createdAt,
      })),
    }),
  );
  await inChunks(plan.saleItems, (chunk) =>
    prisma.saleItem.createMany({
      data: chunk.map((item) => ({
        id: item.id,
        saleId: item.saleId,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: money(item.unitPriceCents),
        unitCost: money(item.unitCostCents),
      })),
    }),
  );
  await prisma.saleAdjustment.createMany({
    data: plan.adjustments.map((adjustment) => ({
      id: adjustment.id,
      saleId: adjustment.saleId,
      type: adjustment.type,
      reason: adjustment.reason,
      total: money(adjustment.totalCents),
      createdAt: adjustment.createdAt,
    })),
  });
  await prisma.saleAdjustmentItem.createMany({
    data: plan.adjustments.flatMap((adjustment) =>
      adjustment.items.map((item) => ({ ...item, adjustmentId: adjustment.id })),
    ),
  });
  await inChunks(plan.creditPayments, (chunk) =>
    prisma.creditPayment.createMany({
      data: chunk.map((payment) => ({
        id: payment.id,
        customerId: payment.customerId,
        saleId: payment.saleId,
        amount: money(payment.amountCents),
        paymentDate: payment.paymentDate,
      })),
    }),
  );

  await inChunks(plan.purchaseOrders, (chunk) =>
    prisma.purchaseOrder.createMany({
      data: chunk.map((order) => ({
        id: order.id,
        businessId,
        number: order.number,
        supplierId: order.supplierId,
        status: order.status,
        total: money(order.totalCents),
        receivedAt: order.receivedAt,
        createdAt: order.createdAt,
      })),
    }),
  );
  await inChunks(
    plan.purchaseOrders.flatMap((order) => order.items.map((item) => ({ ...item, order }))),
    (chunk) =>
      prisma.purchaseOrderItem.createMany({
        data: chunk.map(({ order, ...item }) => ({
          id: item.id,
          purchaseOrderId: order.id,
          productId: item.productId,
          quantity: item.quantity,
          unitCost: money(item.unitCostCents),
          receivedQuantity: item.receivedQuantity,
        })),
      }),
  );
  await inChunks(plan.movements, (chunk) => prisma.inventoryMovement.createMany({ data: chunk }));

  // Los consecutivos siguen donde quedó la simulación (la próxima venta real es la #N+1).
  await prisma.documentSequence.createMany({
    data: [
      { businessId, kind: 'SALE', next: plan.sales.length + 1 },
      { businessId, kind: 'PURCHASE_ORDER', next: plan.purchaseOrders.length + 1 },
    ],
  });
}
