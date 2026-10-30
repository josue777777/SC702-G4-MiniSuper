import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectPrisma, prisma } from '../config/prisma.js';
import { PurchaseOrdersRepository } from './purchase-orders.repository.js';
import { SalesRepository } from './sales.repository.js';

/**
 * CONSECUTIVOS POR NEGOCIO (venta y pedido) e idempotencia por negocio, contra
 * PostgreSQL real.
 *
 * Cada negocio numera sus documentos desde 1: un contador global dejaba ver a
 * un negocio cuánto venden los demás.
 *
 * Borra datos: solo corre si DATABASE_URL apunta a una base `*_test`.
 */
const databaseName = new URL(process.env['DATABASE_URL'] ?? 'postgresql://x/none').pathname;

const A = '0b000000-0000-4000-8000-0000000000a2';
const B = '0b000000-0000-4000-8000-0000000000b2';

interface Seeded {
  productId: string;
  supplierId: string;
}

async function seed(businessId: string, stock: number): Promise<Seeded> {
  await prisma.business.upsert({
    where: { id: businessId },
    create: { id: businessId, name: `Negocio ${businessId.slice(-2)}` },
    update: {},
  });

  const category = await prisma.category.create({ data: { businessId, name: 'Granos' } });
  const product = await prisma.product.create({
    data: {
      businessId,
      code: 'P001',
      name: 'Arroz 1 kg',
      price: '1000.00',
      cost: '800.00',
      stock,
      categoryId: category.id,
    },
  });
  const supplier = await prisma.supplier.create({ data: { businessId, name: 'Distribuidora' } });

  return { productId: product.id, supplierId: supplier.id };
}

/** Plan de una venta en efectivo de `quantity` unidades (precio y costo del catálogo). */
function cashSale(productId: string, quantity = 1, idempotencyKey = randomUUID()) {
  return {
    idempotencyKey,
    paymentMethod: 'CASH' as const,
    customerId: null,
    cashReceived: '100000.00',
    total: (1000 * quantity).toFixed(2),
    items: [{ productId, quantity, expectedUnitPrice: '1000.00' }],
  };
}

function order(supplierId: string, productId: string) {
  return {
    supplierId,
    notes: null,
    total: '800.00',
    items: [{ productId, quantity: 1, unitCost: '800.00' }],
  };
}

async function numberOf(outcome: Awaited<ReturnType<SalesRepository['createSale']>>) {
  if (!outcome.ok) {
    throw new Error(`La venta no se guardó: ${outcome.reason}`);
  }

  return outcome.sale.number;
}

describe.skipIf(!databaseName.endsWith('_test'))('Consecutivos por negocio', () => {
  let a: Seeded;
  let b: Seeded;

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "SaleAdjustmentItem", "SaleAdjustment", "SaleItem", "InventoryMovement", "CreditPayment", "Sale", "Customer", "PurchaseOrderItem", "PurchaseOrder", "SupplierProduct", "Supplier", "Product", "Category", "DocumentSequence" CASCADE',
    );
    a = await seed(A, 100);
    b = await seed(B, 100);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('cada negocio numera sus ventas desde 1, sin ver el volumen del otro', async () => {
    const salesA = new SalesRepository(A);
    const salesB = new SalesRepository(B);

    expect(await numberOf(await salesA.createSale(cashSale(a.productId)))).toBe(1);
    expect(await numberOf(await salesA.createSale(cashSale(a.productId)))).toBe(2);
    expect(await numberOf(await salesA.createSale(cashSale(a.productId)))).toBe(3);
    // B empieza en 1, aunque A ya lleve 3.
    expect(await numberOf(await salesB.createSale(cashSale(b.productId)))).toBe(1);
  });

  it('cada negocio numera sus pedidos desde 1', async () => {
    const ordersA = new PurchaseOrdersRepository(A);
    const ordersB = new PurchaseOrdersRepository(B);

    expect((await ordersA.create(order(a.supplierId, a.productId))).number).toBe(1);
    expect((await ordersA.create(order(a.supplierId, a.productId))).number).toBe(2);
    expect((await ordersB.create(order(b.supplierId, b.productId))).number).toBe(1);
  });

  it('una venta que no se guarda no gasta número: no quedan huecos', async () => {
    const sales = new SalesRepository(A);

    expect(await numberOf(await sales.createSale(cashSale(a.productId)))).toBe(1);

    // Pide más de lo que hay: la transacción se deshace, número incluido.
    const failed = await sales.createSale(cashSale(a.productId, 1000));

    expect(failed).toMatchObject({ ok: false, reason: 'INSUFFICIENT_STOCK' });
    expect(await numberOf(await sales.createSale(cashSale(a.productId)))).toBe(2);
  });

  it('ventas simultáneas del mismo negocio reciben números distintos y seguidos', async () => {
    const sales = new SalesRepository(A);

    const numbers = await Promise.all(
      Array.from({ length: 8 }, async () =>
        numberOf(await sales.createSale(cashSale(a.productId))),
      ),
    );

    expect([...numbers].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('la llave de idempotencia es por negocio: la misma llave no choca entre negocios', async () => {
    const key = randomUUID();
    const first = await new SalesRepository(A).createSale(cashSale(a.productId, 1, key));
    const other = await new SalesRepository(B).createSale(cashSale(b.productId, 1, key));
    const replay = await new SalesRepository(A).createSale(cashSale(a.productId, 1, key));

    expect(first).toMatchObject({ ok: true, created: true });
    expect(other).toMatchObject({ ok: true, created: true });
    // En A, la misma llave devuelve la venta original sin crear otra.
    expect(replay).toMatchObject({ ok: true, created: false });
    expect(await prisma.sale.count({ where: { businessId: A } })).toBe(1);
  });
});
