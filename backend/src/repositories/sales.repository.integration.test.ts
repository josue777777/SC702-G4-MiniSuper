import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectPrisma, prisma } from '../config/prisma.js';
import { CustomersService } from '../services/customers.service.js';
import { SalesService } from '../services/sales.service.js';
import { CustomersRepository } from './customers.repository.js';
import { SalesRepository } from './sales.repository.js';

/**
 * Integración contra PostgreSQL real: transacción, concurrencia, idempotencia y
 * saldo del fiado (HU-16, HU-17, HU-18).
 *
 * Borra datos: solo corre si DATABASE_URL apunta a una base `*_test`.
 */
const databaseName = new URL(process.env['DATABASE_URL'] ?? 'postgresql://x/none').pathname;

/** Negocio de estas pruebas (multi-negocio, ADR 0002). */
const BUSINESS_ID = '0b000000-0000-4000-8000-000000000011';

describe.skipIf(!databaseName.endsWith('_test'))('Ventas (PostgreSQL de prueba)', () => {
  const repository = new SalesRepository(BUSINESS_ID);
  const customersRepository = new CustomersRepository(BUSINESS_ID);
  const service = new SalesService(repository, customersRepository);
  const customersService = new CustomersService(customersRepository);

  let coffeeId = '';
  let riceId = '';
  let customerId = '';

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "SaleAdjustmentItem", "SaleAdjustment", "SaleItem", "InventoryMovement", "CreditPayment", "Sale", "Customer", "Product", "Category", "DocumentSequence" CASCADE',
    );

    await prisma.business.upsert({
      where: { id: BUSINESS_ID },
      create: { id: BUSINESS_ID, name: 'Negocio de ventas' },
      update: {},
    });

    const category = await prisma.category.create({
      data: { businessId: BUSINESS_ID, name: 'Pruebas' },
    });
    const coffee = await prisma.product.create({
      data: {
        businessId: BUSINESS_ID,
        code: 'P001',
        barcode: '7501000000012',
        name: 'Café',
        price: '1500.00',
        cost: '1000.00',
        stock: 10,
        categoryId: category.id,
      },
    });
    const rice = await prisma.product.create({
      data: {
        businessId: BUSINESS_ID,
        code: 'P002',
        name: 'Arroz',
        price: '900.00',
        cost: '700.00',
        stock: 1,
        categoryId: category.id,
      },
    });
    const customer = await prisma.customer.create({
      data: { businessId: BUSINESS_ID, name: 'Doña Marta' },
    });

    coffeeId = coffee.id;
    riceId = rice.id;
    customerId = customer.id;
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  const cardSale = (items: { productId: string; quantity: number }[], key = randomUUID()) => ({
    idempotencyKey: key,
    items,
    paymentMethod: 'CARD' as const,
  });

  it('confirma venta, ítems, stock y movimiento EXIT juntos, con fecha y precio histórico', async () => {
    const { sale } = await service.createSale(cardSale([{ productId: coffeeId, quantity: 3 }]));

    expect(sale.total).toBe('4500.00');
    expect(sale.number).toBeGreaterThan(0);
    expect(Math.abs(Date.now() - Date.parse(sale.createdAt))).toBeLessThan(60_000);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: coffeeId } })).stock).toBe(7);

    const movements = await prisma.inventoryMovement.findMany({ where: { saleId: sale.id } });

    expect(movements).toEqual([
      expect.objectContaining({ type: 'EXIT', quantity: 3, stockBefore: 10, stockAfter: 7 }),
    ]);

    // El precio del catálogo cambia después: la venta conserva el original.
    await prisma.product.update({ where: { id: coffeeId }, data: { price: '9999.00' } });

    const stored = await service.getSale(sale.id);

    expect(stored.items[0]?.unitPrice).toBe('1500.00');
    expect(stored.total).toBe('4500.00');
  });

  it('si una línea falla, NO queda venta, ni movimientos, ni stock descontado (rollback)', async () => {
    const outcome = await repository.createSale({
      idempotencyKey: randomUUID(),
      paymentMethod: 'CARD',
      customerId: null,
      cashReceived: null,
      total: '2400.00',
      items: [
        { productId: coffeeId, quantity: 1, expectedUnitPrice: '1500.00' },
        { productId: riceId, quantity: 5, expectedUnitPrice: '900.00' },
      ],
    });

    expect(outcome).toEqual({ ok: false, reason: 'INSUFFICIENT_STOCK', productId: riceId });
    expect(await prisma.sale.count()).toBe(0);
    expect(await prisma.saleItem.count()).toBe(0);
    expect(await prisma.inventoryMovement.count()).toBe(0);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: coffeeId } })).stock).toBe(10);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: riceId } })).stock).toBe(1);
  });

  it('rechaza con rollback si el precio cambió entre el cálculo y la confirmación', async () => {
    const outcome = await repository.createSale({
      idempotencyKey: randomUUID(),
      paymentMethod: 'CARD',
      customerId: null,
      cashReceived: null,
      total: '1.00',
      items: [{ productId: coffeeId, quantity: 1, expectedUnitPrice: '1.00' }],
    });

    expect(outcome).toMatchObject({ ok: false, reason: 'PRICE_CHANGED' });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: coffeeId } })).stock).toBe(10);
  });

  it('dos ventas simultáneas del último producto: una gana y el stock nunca queda negativo', async () => {
    const results = await Promise.allSettled([
      service.createSale(cardSale([{ productId: riceId, quantity: 1 }])),
      service.createSale(cardSale([{ productId: riceId, quantity: 1 }])),
      service.createSale(cardSale([{ productId: riceId, quantity: 1 }])),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    for (const result of results) {
      if (result.status === 'rejected') {
        expect(result.reason).toMatchObject({ statusCode: 409 });
      }
    }
    expect((await prisma.product.findUniqueOrThrow({ where: { id: riceId } })).stock).toBe(0);
    expect(await prisma.sale.count()).toBe(1);
    expect(await prisma.inventoryMovement.count()).toBe(1);
  });

  it('la misma llave de idempotencia, enviada a la vez, crea una sola venta y descuenta una sola vez', async () => {
    const payload = cardSale([{ productId: coffeeId, quantity: 2 }]);

    const results = await Promise.all([
      service.createSale(payload),
      service.createSale(payload),
      service.createSale(payload),
    ]);

    expect(new Set(results.map((result) => result.sale.id)).size).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(await prisma.sale.count()).toBe(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: coffeeId } })).stock).toBe(8);
  });

  it('efectivo: guarda el recibido y deriva el cambio; el historial filtra por método', async () => {
    const { sale } = await service.createSale({
      idempotencyKey: randomUUID(),
      items: [{ productId: coffeeId, quantity: 1 }],
      paymentMethod: 'CASH',
      cashReceived: '2000',
    });
    await service.createSale(cardSale([{ productId: coffeeId, quantity: 1 }]));

    expect(sale).toMatchObject({ cashReceived: '2000.00', change: '500.00' });
    expect(await service.listSales({ paymentMethod: 'CASH', limit: 50 })).toHaveLength(1);
    expect(await service.listSales({ limit: 50 })).toHaveLength(2);
  });

  it('devuelve unidades, recalcula total y audita la devolución y anulación en una transacción', async () => {
    const { sale } = await service.createSale(cardSale([{ productId: coffeeId, quantity: 3 }]));

    const returned = await service.adjustSale(sale.id, {
      type: 'RETURN',
      reason: 'Producto defectuoso',
      items: [{ saleItemId: sale.items[0]!.id, quantity: 1 }],
    });

    expect(returned).toMatchObject({
      status: 'PARTIALLY_RETURNED',
      total: '3000.00',
      adjustments: [
        expect.objectContaining({
          type: 'RETURN',
          reason: 'Producto defectuoso',
          total: '1500.00',
        }),
      ],
      items: [expect.objectContaining({ quantity: 3, returnedQuantity: 1, availableQuantity: 2 })],
    });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: coffeeId } })).stock).toBe(8);

    const voided = await service.adjustSale(sale.id, { type: 'VOID', reason: 'Venta equivocada' });

    expect(voided).toMatchObject({ status: 'VOID', total: '0.00' });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: coffeeId } })).stock).toBe(10);
    await expect(
      service.adjustSale(sale.id, { type: 'VOID', reason: 'Reintento' }),
    ).rejects.toMatchObject({ statusCode: 409 });

    const movements = await prisma.inventoryMovement.findMany({
      where: { saleId: sale.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(movements.map((movement) => [movement.type, movement.quantity])).toEqual([
      ['EXIT', 3],
      ['ENTRY', 1],
      ['ENTRY', 2],
    ]);
  });

  it('dos devoluciones concurrentes no restituyen stock ni aplican total dos veces', async () => {
    const { sale } = await service.createSale(cardSale([{ productId: riceId, quantity: 1 }]));
    const payload = {
      type: 'RETURN' as const,
      reason: 'Devolución duplicada',
      items: [{ saleItemId: sale.items[0]!.id, quantity: 1 }],
    };

    const outcomes = await Promise.allSettled([
      service.adjustSale(sale.id, payload),
      service.adjustSale(sale.id, payload),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: riceId } })).stock).toBe(1);
    expect(await prisma.saleAdjustment.count({ where: { saleId: sale.id } })).toBe(1);
    expect((await service.getSale(sale.id)).total).toBe('0.00');
  });

  it('fiado: saldo = ventas CREDIT − abonos, con precisión decimal y dos fiados seguidos', async () => {
    // Fiado histórico cargado directo en la base (número fuera del contador).
    await prisma.sale.create({
      data: {
        businessId: BUSINESS_ID,
        number: 900,
        paymentMethod: 'CREDIT',
        total: '5000.00',
        customerId,
      },
    });
    await prisma.creditPayment.create({ data: { customerId, amount: '1000.50' } });
    // Una venta en efectivo no suma a la deuda.
    await service.createSale({
      idempotencyKey: randomUUID(),
      items: [{ productId: coffeeId, quantity: 1 }],
      paymentMethod: 'CASH',
      cashReceived: '1500',
    });

    const credit = (quantity: number) =>
      service.createSale({
        idempotencyKey: randomUUID(),
        items: [{ productId: coffeeId, quantity }],
        paymentMethod: 'CREDIT',
        customerId,
      });

    // 5000.00 − 1000.50 + 1500.00
    expect((await credit(1)).sale.customerBalance).toBe('5499.50');
    expect((await credit(1)).sale.customerBalance).toBe('6999.50');
    expect((await customersService.listActiveCustomers())[0]?.balance).toBe('6999.50');
    expect((await prisma.product.findUniqueOrThrow({ where: { id: coffeeId } })).stock).toBe(7);
  });

  it('busca por código de barras y rechaza un cliente inexistente', async () => {
    expect((await service.lookupProduct('7501000000012')).id).toBe(coffeeId);
    await expect(
      service.createSale({
        idempotencyKey: randomUUID(),
        items: [{ productId: coffeeId, quantity: 1 }],
        paymentMethod: 'CREDIT',
        customerId: randomUUID(),
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(await prisma.sale.count()).toBe(0);
  });
});
