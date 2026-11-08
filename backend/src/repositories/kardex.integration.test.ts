import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { disconnectPrisma, prisma } from '../config/prisma.js';
import { InventoryService } from '../services/inventory.service.js';
import { KardexService } from '../services/kardex.service.js';
import { ProductsService } from '../services/products.service.js';
import { SalesService } from '../services/sales.service.js';
import { CustomersRepository } from './customers.repository.js';
import { InventoryRepository } from './inventory.repository.js';
import { KardexRepository } from './kardex.repository.js';
import { ProductsRepository } from './products.repository.js';
import { SalesRepository } from './sales.repository.js';

/**
 * Kardex (HU-31) contra PostgreSQL real. Los movimientos los dejan los flujos
 * REALES del sistema (alta con stock inicial, edición, venta, devolución, conteo
 * físico), no datos inventados; además se comprueba que consultar el Kardex no
 * cambia nada.
 *
 * Borra datos: solo corre si DATABASE_URL apunta a una base `*_test`.
 */
const databaseName = new URL(process.env['DATABASE_URL'] ?? 'postgresql://x/none').pathname;

const A = '0b000000-0000-4000-8000-0000000000f1';
const B = '0b000000-0000-4000-8000-0000000000f2';

/** Separa los movimientos en el tiempo: el orden de la prueba no depende del reloj de la máquina. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 8));

describe.skipIf(!databaseName.endsWith('_test'))('Kardex (PostgreSQL de prueba)', () => {
  const kardex = new KardexService(new KardexRepository(A));
  const kardexOfB = new KardexService(new KardexRepository(B));
  const salesRepository = new SalesRepository(A);

  const ids: Record<string, string> = {};
  let saleNumber = 0;

  /** Estado completo de lo que Kardex nunca debe modificar. */
  async function snapshot() {
    return {
      products: await prisma.product.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, stock: true },
      }),
      movements: await prisma.inventoryMovement.count(),
    };
  }

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "SaleAdjustmentItem", "SaleAdjustment", "SaleItem", "InventoryMovement", "CreditPayment", "Sale", "Customer", "SupplierProduct", "Supplier", "Product", "Category", "DocumentSequence" CASCADE',
    );

    for (const [id, name] of [
      [A, 'Negocio A'],
      [B, 'Negocio B'],
    ] as const) {
      await prisma.business.upsert({ where: { id }, create: { id, name }, update: { name } });
    }

    const category = await prisma.category.create({ data: { businessId: A, name: 'Bebidas' } });
    const supplier = await prisma.supplier.create({
      data: { businessId: A, name: 'Distribuidora Central' },
    });
    const otherCategory = await prisma.category.create({
      data: { businessId: B, name: 'Bebidas' },
    });

    ids['category'] = category.id;
    ids['supplier'] = supplier.id;

    // --- Flujos reales sobre el producto «P001» ---
    const products = new ProductsService(new ProductsRepository(A));
    const inventory = new InventoryService(new InventoryRepository(A));
    const sales = new SalesService(salesRepository, new CustomersRepository(A));

    const coffee = await products.createProduct({
      code: 'P001',
      name: 'Café molido 500 g',
      categoryId: category.id,
      price: '1500.00',
      cost: '1000.50',
      stock: 10,
      supplierId: supplier.id,
    });

    ids['coffee'] = coffee.id;
    await tick();

    // Venta de 3 unidades: 10 → 7.
    const sale = await sales.createSale({
      idempotencyKey: randomUUID(),
      items: [{ productId: coffee.id, quantity: 3 }],
      paymentMethod: 'CARD',
    });

    saleNumber = sale.sale.number;
    ids['sale'] = sale.sale.id;
    await tick();

    // Devolución de 1 unidad de esa venta: 7 → 8.
    await salesRepository.adjustSale({
      saleId: sale.sale.id,
      type: 'RETURN',
      reason: 'Empaque dañado',
      items: [{ saleItemId: sale.sale.items[0]?.id ?? '', quantity: 1 }],
    });
    await tick();

    // Conteo físico que sobra mercadería (8 → 15) y otro que falta (15 → 4).
    await inventory.registerCount({ productId: coffee.id, countedQuantity: 15 });
    await tick();
    await inventory.registerCount({ productId: coffee.id, countedQuantity: 4 });
    await tick();

    // Edición del producto que cambia el stock (4 → 6): ajuste desde la ficha de edición.
    await products.updateProduct(coffee.id, {
      code: 'P001',
      name: 'Café molido 500 g',
      categoryId: category.id,
      price: '1500.00',
      cost: '1000.50',
      stock: 6,
      supplierId: supplier.id,
    });

    // --- Otros productos ---
    ids['empty'] = (
      await prisma.product.create({
        data: {
          businessId: A,
          code: 'P002',
          name: 'Arroz 1 kg',
          price: '900',
          cost: '700',
          stock: 0,
          categoryId: category.id,
        },
      })
    ).id;
    ids['inactive'] = (
      await prisma.product.create({
        data: {
          businessId: A,
          code: 'P003',
          name: 'Descontinuado',
          price: '100',
          cost: '50',
          stock: 2,
          isActive: false,
          categoryId: category.id,
        },
      })
    ).id;
    ids['foreign'] = (
      await prisma.product.create({
        data: {
          businessId: B,
          code: 'P001',
          name: 'Producto de B',
          price: '1',
          cost: '1',
          stock: 1,
          categoryId: otherCategory.id,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('la ficha muestra código, categoría, precio, costo, proveedor y stock reales', async () => {
    expect(await kardex.getProduct(ids['coffee'] ?? '')).toMatchObject({
      code: 'P001',
      name: 'Café molido 500 g',
      categoryName: 'Bebidas',
      price: '1500.00',
      cost: '1000.50',
      supplierName: 'Distribuidora Central',
      stock: 6,
      isActive: true,
    });
  });

  it('el historial reúne stock inicial, venta, devolución, conteos y edición, del más reciente al más antiguo', async () => {
    const page = await kardex.listMovements(ids['coffee'] ?? '', { page: 1, pageSize: 25 });

    expect(page.total).toBe(6);
    expect(
      page.items.map((item) => [
        item.concept,
        item.document,
        item.entry,
        item.exit,
        item.stockBefore,
        item.stockAfter,
      ]),
    ).toEqual([
      ['Ajuste desde edición de producto', null, 2, 0, 4, 6],
      ['Conteo físico', null, 0, 11, 15, 4],
      ['Conteo físico', null, 7, 0, 8, 15],
      ['Devolución de cliente', String(saleNumber), 1, 0, 7, 8],
      ['Venta', String(saleNumber), 0, 3, 10, 7],
      ['Stock inicial', null, 10, 0, 0, 10],
    ]);

    // El saldo encadena: cada movimiento parte de donde terminó el anterior.
    const chronological = [...page.items].reverse();

    chronological.forEach((item, index) => {
      if (index > 0) {
        expect(item.stockBefore).toBe(chronological[index - 1]?.stockAfter);
      }
    });
    expect(page.items[0]?.stockAfter).toBe(6);

    // La venta y su devolución enlazan con la venta real (solo su número).
    expect(page.items.find((item) => item.concept === 'Venta')?.reference).toEqual({
      type: 'SALE',
      id: ids['sale'],
      number: saleNumber,
    });
    expect(
      page.items.find((item) => item.concept.startsWith('Devolución'))?.reference?.number,
    ).toBe(saleNumber);
    expect(page.items.at(-1)?.reference).toBeNull();
  });

  it('un producto sin movimientos tiene historial vacío y uno desactivado se consulta igual', async () => {
    expect(await kardex.listMovements(ids['empty'] ?? '', { page: 1, pageSize: 25 })).toEqual({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
    });
    expect(await kardex.getProduct(ids['inactive'] ?? '')).toMatchObject({
      isActive: false,
      supplierName: null,
    });
  });

  it('pagina un historial largo sin repetir ni omitir movimientos, con el mismo orden siempre', async () => {
    // 60 movimientos en un producto propio; varios comparten el instante exacto.
    const product = await prisma.product.create({
      data: {
        businessId: A,
        code: 'P100',
        name: 'Con mucho historial',
        price: '1',
        cost: '1',
        stock: 60,
        categoryId: ids['category'] ?? '',
      },
    });
    const base = Date.parse('2026-01-01T12:00:00Z');

    await prisma.inventoryMovement.createMany({
      data: Array.from({ length: 60 }, (_, index) => ({
        productId: product.id,
        type: 'ENTRY' as const,
        quantity: 1,
        stockBefore: index,
        stockAfter: index + 1,
        reason: `Movimiento ${index + 1}`,
        // De a tres por instante: obliga al desempate.
        createdAt: new Date(base + Math.floor(index / 3) * 60_000),
      })),
    });

    const seen: string[] = [];
    const first = await kardex.listMovements(product.id, { page: 1, pageSize: 25 });

    expect(first).toMatchObject({ total: 60, totalPages: 3 });

    for (let page = 1; page <= first.totalPages; page += 1) {
      seen.push(
        ...(await kardex.listMovements(product.id, { page, pageSize: 25 })).items.map((i) => i.id),
      );
    }

    const again: string[] = [];

    for (let page = 1; page <= 3; page += 1) {
      again.push(
        ...(await kardex.listMovements(product.id, { page, pageSize: 25 })).items.map((i) => i.id),
      );
    }

    expect(new Set(seen).size).toBe(60);
    expect(again).toEqual(seen);

    // Con un tamaño de página distinto sale la misma secuencia completa.
    const wide = await kardex.listMovements(product.id, { page: 1, pageSize: 100 });

    expect(wide.items.map((item) => item.id)).toEqual(seen);

    // Fecha descendente de punta a punta.
    const times = wide.items.map((item) => Date.parse(item.createdAt));

    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('un ajuste positivo es entrada y uno negativo es salida, sin importar el tipo', async () => {
    const product = await prisma.product.create({
      data: {
        businessId: A,
        code: 'P200',
        name: 'Ajustes',
        price: '1',
        cost: '1',
        stock: 5,
        categoryId: ids['category'] ?? '',
      },
    });

    await prisma.inventoryMovement.createMany({
      data: [
        {
          productId: product.id,
          type: 'ADJUSTMENT',
          quantity: 5,
          stockBefore: 0,
          stockAfter: 5,
          reason: 'Sube',
          createdAt: new Date('2026-02-01T10:00:00Z'),
        },
        {
          productId: product.id,
          type: 'ADJUSTMENT',
          quantity: 2,
          stockBefore: 5,
          stockAfter: 3,
          reason: 'Baja',
          createdAt: new Date('2026-02-02T10:00:00Z'),
        },
      ],
    });

    const page = await kardex.listMovements(product.id, { page: 1, pageSize: 25 });

    expect(page.items.map((item) => [item.concept, item.entry, item.exit])).toEqual([
      ['Baja', 0, 2],
      ['Sube', 5, 0],
    ]);
  });

  it('muestra un movimiento de compra cuando alguien lo registra con su pedido (preparado para HU-38)', async () => {
    const product = await prisma.product.create({
      data: {
        businessId: A,
        code: 'P300',
        name: 'Compras',
        price: '1',
        cost: '1',
        stock: 12,
        categoryId: ids['category'] ?? '',
      },
    });
    const order = await prisma.purchaseOrder.create({
      data: { businessId: A, number: 7, supplierId: ids['supplier'] ?? '', total: '0' },
    });

    await prisma.inventoryMovement.create({
      data: {
        productId: product.id,
        type: 'ENTRY',
        quantity: 12,
        stockBefore: 0,
        stockAfter: 12,
        reason: 'Recepción de pedido',
        purchaseOrderId: order.id,
      },
    });

    const page = await kardex.listMovements(product.id, { page: 1, pageSize: 25 });

    expect(page.items[0]).toMatchObject({
      concept: 'Recepción PED-0007',
      document: 'PED-0007',
      entry: 12,
      reference: { type: 'PURCHASE_ORDER', id: order.id, number: 7 },
    });
  });

  it('un negocio no puede consultar los productos de otro', async () => {
    // El producto de B existe, pero para A es como si no existiera, y viceversa.
    await expect(kardex.getProduct(ids['foreign'] ?? '')).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      kardex.listMovements(ids['foreign'] ?? '', { page: 1, pageSize: 25 }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(kardexOfB.getProduct(ids['coffee'] ?? '')).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      kardexOfB.listMovements(ids['coffee'] ?? '', { page: 1, pageSize: 25 }),
    ).rejects.toMatchObject({ statusCode: 404 });

    // La vista general de cada negocio solo trae sus movimientos.
    await prisma.inventoryMovement.create({
      data: {
        productId: ids['foreign'] ?? '',
        type: 'ENTRY',
        quantity: 1,
        stockBefore: 0,
        stockAfter: 1,
        reason: 'Movimiento de B',
      },
    });

    const ofA = await kardex.listRecentMovements({ page: 1, pageSize: 100 });
    const ofB = await kardexOfB.listRecentMovements({ page: 1, pageSize: 100 });

    expect(ofA.items.some((item) => item.product.id === ids['foreign'])).toBe(false);
    expect(ofA.items.length).toBeGreaterThan(0);
    expect(ofB.items.map((item) => item.concept)).toEqual(['Movimiento de B']);
    expect(ofB.today).toEqual({ entries: 1, exits: 0, count: 1 });

    // El selector de B solo ofrece sus productos.
    expect((await kardexOfB.searchProducts(undefined)).map((option) => option.name)).toEqual([
      'Producto de B',
    ]);
  });

  it('el selector encuentra por nombre o código, sin distinguir mayúsculas, e incluye desactivados', async () => {
    expect((await kardex.searchProducts('CAF')).map((option) => option.code)).toEqual(['P001']);
    expect(
      (await kardex.searchProducts('p003')).map((option) => [option.code, option.isActive]),
    ).toEqual([['P003', false]]);
    expect((await kardex.searchProducts('no-existe')).length).toBe(0);

    // Con el lector: el código de barras completo encuentra el producto, con su stock.
    await prisma.product.update({
      where: { id: ids['coffee'] },
      data: { barcode: '7501000000012' },
    });
    expect(
      (await kardex.searchProducts('7501000000012')).map((option) => [option.code, option.stock]),
    ).toEqual([['P001', 6]]);
  });

  it('consultar el Kardex NO modifica stock ni crea movimientos', async () => {
    const before = await snapshot();

    await kardex.getProduct(ids['coffee'] ?? '');
    await kardex.listMovements(ids['coffee'] ?? '', { page: 1, pageSize: 100 });
    await kardex.searchProducts('');

    expect(await snapshot()).toEqual(before);
  });
});
