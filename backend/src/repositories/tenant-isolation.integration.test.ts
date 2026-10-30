import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectPrisma, prisma } from '../config/prisma.js';
import { InventoryService } from '../services/inventory.service.js';
import { ProductsService } from '../services/products.service.js';
import { PurchaseOrdersService } from '../services/purchase-orders.service.js';
import { SalesService } from '../services/sales.service.js';
import { CategoriesRepository } from './categories.repository.js';
import { CustomersRepository } from './customers.repository.js';
import { nextDocumentNumber } from './document-sequence.js';
import { InventoryRepository } from './inventory.repository.js';
import { PlatformRepository } from './platform.repository.js';
import { ProductsRepository } from './products.repository.js';
import { PurchaseOrdersRepository } from './purchase-orders.repository.js';
import { SalesRepository } from './sales.repository.js';
import { SuppliersRepository } from './suppliers.repository.js';

/**
 * AISLAMIENTO ENTRE NEGOCIOS (multi-negocio, ADR 0002), contra PostgreSQL real.
 *
 * Dos negocios, A y B, con los MISMOS códigos de producto. Con los
 * repositorios atados al negocio B, nada de A se ve, se vende ni se modifica.
 * Si alguien agrega una consulta y olvida filtrar por negocio, esta prueba
 * debe fallar.
 *
 * Borra datos: solo corre si DATABASE_URL apunta a una base `*_test`.
 */
const databaseName = new URL(process.env['DATABASE_URL'] ?? 'postgresql://x/none').pathname;

const A = '0b000000-0000-4000-8000-0000000000a1';
const B = '0b000000-0000-4000-8000-0000000000b1';

interface Seeded {
  categoryId: string;
  productId: string;
  customerId: string;
  supplierId: string;
  saleId: string;
  orderId: string;
}

/** Cada negocio con su categoría, producto «P001», cliente, proveedor, venta y pedido. */
async function seed(businessId: string, label: string): Promise<Seeded> {
  const category = await prisma.category.create({ data: { businessId, name: 'Lácteos' } });
  const product = await prisma.product.create({
    data: {
      businessId,
      code: 'P001',
      barcode: '7501000000012',
      name: `Leche ${label}`,
      price: '1000.00',
      cost: '800.00',
      stock: 10,
      minStock: 2,
      categoryId: category.id,
    },
  });
  const customer = await prisma.customer.create({
    data: { businessId, name: `Cliente ${label}` },
  });
  const supplier = await prisma.supplier.create({
    data: {
      businessId,
      name: 'Distribuidora',
      products: { create: { productId: product.id, unitCost: '800.00', isPreferred: true } },
    },
  });
  // Los dos negocios tienen su «Venta #1» y su «Pedido #1»: el consecutivo es por negocio.
  const sale = await prisma.$transaction(async (tx) =>
    tx.sale.create({
      data: {
        businessId,
        number: await nextDocumentNumber(tx, businessId, 'SALE'),
        paymentMethod: 'CREDIT',
        total: '1000.00',
        customerId: customer.id,
      },
    }),
  );
  const order = await prisma.purchaseOrder.create({
    data: {
      businessId,
      number: await prisma.$transaction((tx) =>
        nextDocumentNumber(tx, businessId, 'PURCHASE_ORDER'),
      ),
      supplierId: supplier.id,
      total: '800.00',
      items: { create: { productId: product.id, quantity: 1, unitCost: '800.00' } },
    },
  });

  return {
    categoryId: category.id,
    productId: product.id,
    customerId: customer.id,
    supplierId: supplier.id,
    saleId: sale.id,
    orderId: order.id,
  };
}

describe.skipIf(!databaseName.endsWith('_test'))('Aislamiento entre negocios', () => {
  let a: Seeded;

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "SaleAdjustmentItem", "SaleAdjustment", "SaleItem", "InventoryMovement", "CreditPayment", "Sale", "Customer", "PurchaseOrderItem", "PurchaseOrder", "SupplierProduct", "Supplier", "Product", "Category", "PlanRequest", "DocumentSequence" CASCADE',
    );
    await prisma.user.deleteMany({ where: { businessId: { in: [A, B] } } });

    for (const [id, name] of [
      [A, 'Negocio A'],
      [B, 'Negocio B'],
    ] as const) {
      await prisma.business.upsert({
        where: { id },
        create: { id, name },
        update: { extraUsers: 0 },
      });
    }

    a = await seed(A, 'A');
    await seed(B, 'B');
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('productos: B ve solo los suyos y no puede leer ni cambiar los de A', async () => {
    const products = new ProductsService(new ProductsRepository(B));

    expect((await products.listProducts()).map((product) => product.name)).toEqual(['Leche B']);
    await expect(products.deactivateProduct(a.productId)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: a.productId } })).isActive).toBe(
      true,
    );
  });

  it('el mismo código «P001» existe en los dos negocios sin chocar', async () => {
    expect(await prisma.product.count({ where: { code: 'P001' } })).toBe(2);
  });

  it('categorías y proveedores: B solo ve los suyos', async () => {
    expect(await new CategoriesRepository(B).list()).toHaveLength(1);
    expect(await new SuppliersRepository(B).list()).toHaveLength(1);
    // Un producto de A no cuenta como válido para un proveedor de B.
    expect(await new SuppliersRepository(B).findActiveProductIds([a.productId])).toEqual([]);
  });

  it('ventas: B no puede venderle a la caja un producto de A, ni por código ni por id', async () => {
    const sales = new SalesService(new SalesRepository(B), new CustomersRepository(B));

    expect((await sales.lookupProduct('7501000000012')).name).toBe('Leche B');
    await expect(
      sales.createSale({
        idempotencyKey: randomUUID(),
        paymentMethod: 'CARD',
        items: [{ productId: a.productId, quantity: 1 }],
      }),
    ).rejects.toMatchObject({ statusCode: expect.any(Number) });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: a.productId } })).stock).toBe(10);
  });

  it('ventas (segunda capa, el SQL directo): el repositorio de B no descuenta stock de A', async () => {
    // Saltándose el service a propósito: aunque un id ajeno llegara al repositorio,
    // el UPDATE del stock exige el negocio y no toca nada de A.
    const outcome = await new SalesRepository(B).createSale({
      idempotencyKey: randomUUID(),
      paymentMethod: 'CARD',
      total: '1000.00',
      cashReceived: null,
      customerId: null,
      items: [{ productId: a.productId, quantity: 1, expectedUnitPrice: '1000.00' }],
    });

    expect(outcome).toEqual(expect.objectContaining({ ok: false, reason: 'UNAVAILABLE' }));
    expect((await prisma.product.findUniqueOrThrow({ where: { id: a.productId } })).stock).toBe(10);
  });

  it('ventas: B no ve, no lista ni anula ventas de A, y su resumen del día es solo suyo', async () => {
    const sales = new SalesService(new SalesRepository(B), new CustomersRepository(B));

    await expect(sales.getSale(a.saleId)).rejects.toMatchObject({ statusCode: 404 });
    expect(await sales.listSales({ limit: 50 })).toHaveLength(1);
    await expect(
      sales.adjustSale(a.saleId, { type: 'VOID', reason: 'Intento ajeno', items: [] }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect((await sales.getDailySummary()).total).toBe('1000.00');
  });

  it('clientes y fiado: B no ve los clientes de A ni puede fiarles', async () => {
    const customers = new CustomersRepository(B);

    expect((await customers.listActive()).map((customer) => customer.name)).toEqual(['Cliente B']);
    expect(await customers.findRef(a.customerId)).toBeNull();
    // La base también lo impide: venta de B fiada a un cliente de A.
    await expect(
      prisma.sale.create({
        // Número libre en B: si falla, es por el cliente ajeno y no por un número repetido.
        data: {
          businessId: B,
          number: 99,
          paymentMethod: 'CREDIT',
          total: '1.00',
          customerId: a.customerId,
        },
      }),
    ).rejects.toThrow();
  });

  it('inventario: B no ve alertas de A ni puede cambiar el mínimo de un producto de A', async () => {
    const inventory = new InventoryService(new InventoryRepository(B));

    expect(await inventory.listProductSettings()).toHaveLength(1);
    await expect(inventory.updateMinStock(a.productId, { minStock: 99 })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: a.productId } })).minStock).toBe(
      2,
    );
  });

  it('pedidos: B no ve pedidos de A ni puede pedirle a un proveedor de A', async () => {
    const orders = new PurchaseOrdersService(new PurchaseOrdersRepository(B));

    expect(await orders.listOrders({})).toHaveLength(1);
    await expect(orders.getOrder(a.orderId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      orders.createOrder({
        supplierId: a.supplierId,
        notes: null,
        items: [{ productId: a.productId, quantity: 1 }],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('la base impide un producto de B con la categoría de A', async () => {
    await expect(
      prisma.product.create({
        data: {
          businessId: B,
          code: 'X',
          name: 'X',
          price: '1',
          cost: '1',
          categoryId: a.categoryId,
        },
      }),
    ).rejects.toThrow();
  });
});

describe.skipIf(!databaseName.endsWith('_test'))('Plataforma (PostgreSQL de prueba)', () => {
  const platform = new PlatformRepository();

  beforeEach(async () => {
    await prisma.planRequest.deleteMany();
    await prisma.user.deleteMany({ where: { email: { endsWith: '@plataforma.cr' } } });
  });

  afterAll(async () => {
    await prisma.planRequest.deleteMany();
    await disconnectPrisma();
  });

  it('crea el negocio y su Encargado juntos; con un correo repetido no deja un negocio huérfano', async () => {
    const before = await prisma.business.count();
    const fields = {
      businessName: 'Súper Nuevo',
      extraUsers: 0,
      manager: { name: 'Laura', email: 'laura@plataforma.cr', passwordHash: 'h' },
    };

    const created = await platform.createBusinessWithManager(fields);
    const duplicated = await platform.createBusinessWithManager({
      ...fields,
      businessName: 'Otro',
    });

    expect(created?.business).toEqual(
      expect.objectContaining({ name: 'Súper Nuevo', maxUsers: 1, usedSeats: 1 }),
    );
    expect(created?.business.manager?.email).toBe('laura@plataforma.cr');
    expect(duplicated).toBeNull();
    expect(await prisma.business.count()).toBe(before + 1);
  });

  it('una sola solicitud pendiente por negocio, y aprobarla dos veces a la vez suma una sola vez', async () => {
    const created = await platform.createBusinessWithManager({
      businessName: 'Con solicitud',
      extraUsers: 0,
      manager: { name: 'Mario', email: 'mario@plataforma.cr', passwordHash: 'h' },
    });
    const businessId = created?.business.id ?? '';
    const requestedById = created?.manager.id ?? '';
    const fields = {
      businessId,
      requestedById,
      extraUsers: 2,
      monthlyAmount: '10000.00',
      note: null,
    };

    const request = await platform.createRequest(fields);

    expect(await platform.createRequest(fields)).toBeNull();

    const decision = { status: 'APPROVED' as const, decidedById: requestedById, response: null };
    const results = await Promise.all([
      platform.decideRequest(request?.id ?? '', decision),
      platform.decideRequest(request?.id ?? '', decision),
    ]);

    expect(results.filter((result) => result !== null)).toHaveLength(1);
    expect((await platform.findBusiness(businessId))?.extraUsers).toBe(2);
  });
});
