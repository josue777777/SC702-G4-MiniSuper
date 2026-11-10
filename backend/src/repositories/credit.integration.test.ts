import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectPrisma, prisma } from '../config/prisma.js';
import { CreditService } from '../services/credit.service.js';
import { CustomersService } from '../services/customers.service.js';
import { ReportsService } from '../services/reports.service.js';
import { SalesService } from '../services/sales.service.js';
import type { ReportResult } from '../types/reports.js';
import { todayInBusinessZone } from '../utils/dates.js';
import type { RegisterPaymentInput } from '../validators/credit.validator.js';
import { registerPaymentSchema } from '../validators/credit.validator.js';
import { CreditRepository } from './credit.repository.js';
import { CustomersRepository } from './customers.repository.js';
import { ReportsRepository } from './reports.repository.js';
import { SalesRepository } from './sales.repository.js';

/**
 * Abonos y liquidación de fiados (HU-19) contra PostgreSQL real. Los fiados se
 * crean con el flujo REAL de ventas (HU-18) y las devoluciones y anulaciones con
 * el de HU-35; los reportes HU-29 y HU-30 se consultan con los servicios reales.
 *
 * Borra datos: solo corre si DATABASE_URL apunta a una base `*_test`.
 */
const databaseName = new URL(process.env['DATABASE_URL'] ?? 'postgresql://x/none').pathname;

const A = '0b000000-0000-4000-8000-0000000000a9';
const B = '0b000000-0000-4000-8000-0000000000b9';
const USER_ID = '0a000000-0000-4000-8000-0000000000a9';

describe.skipIf(!databaseName.endsWith('_test'))('Abonos de fiados (PostgreSQL de prueba)', () => {
  const credit = new CreditService(new CreditRepository(A));
  /** Todo el historial en una sola página (las pruebas cuentan abonos, no páginas). */
  const ALL = { page: 1, pageSize: 50 };
  const creditB = new CreditService(new CreditRepository(B));
  const sales = new SalesService(new SalesRepository(A), new CustomersRepository(A));
  const customersService = new CustomersService(new CustomersRepository(A));
  const reports = new ReportsService(new ReportsRepository(A));
  const today = todayInBusinessZone();

  let productId = '';
  let foreignProductId = '';

  /** Cliente nuevo del negocio A (o del B). */
  async function newCustomer(name = 'Cliente', business = A): Promise<string> {
    return (await prisma.customer.create({ data: { businessId: business, name } })).id;
  }

  /** Fiado REAL por la caja (HU-18): `units` × ₡1 000. Devuelve el id de la venta y el de su línea. */
  async function fiar(customerId: string, units: number) {
    const { sale } = await sales.createSale({
      idempotencyKey: randomUUID(),
      items: [{ productId, quantity: units }],
      paymentMethod: 'CREDIT',
      customerId,
    });

    return { id: sale.id, number: sale.number, lineId: sale.items[0]?.id ?? '' };
  }

  const request = (
    amount: string,
    overrides: Partial<RegisterPaymentInput> = {},
  ): RegisterPaymentInput => ({
    idempotencyKey: randomUUID(),
    amount,
    notes: null,
    saleId: null,
    ...overrides,
  });

  const pay = (customerId: string, amount: string, overrides: Partial<RegisterPaymentInput> = {}) =>
    credit.registerPayment(customerId, request(amount, overrides), USER_ID);

  const payments = (customerId: string) =>
    prisma.creditPayment.findMany({
      where: { customerId },
      orderBy: [{ amount: 'desc' }, { id: 'asc' }],
    });

  const sum = (rows: { amount: { toFixed(n: number): string } }[]) =>
    rows.reduce((total, row) => total + Math.round(Number(row.amount.toFixed(2)) * 100), 0) / 100;

  const total = (report: ReportResult, label: string) =>
    report.totals.find((entry) => entry.label === label)?.value;

  /** Lo que nunca debe cambiar al consultar. */
  async function snapshot() {
    return {
      operations: await prisma.creditPaymentOperation.count(),
      payments: await prisma.creditPayment.count(),
      sales: await prisma.sale.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, total: true, status: true },
      }),
      stock: (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock,
    };
  }

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "CreditPaymentOperation", "CreditPayment", "SaleAdjustmentItem", "SaleAdjustment", "SaleItem", "InventoryMovement", "Sale", "Customer", "SupplierProduct", "Supplier", "Product", "Category", "DocumentSequence" CASCADE',
    );

    for (const [id, name] of [
      [A, 'Negocio A'],
      [B, 'Negocio B'],
    ] as const) {
      await prisma.business.upsert({ where: { id }, create: { id, name }, update: { name } });
    }

    await prisma.user.upsert({
      where: { id: USER_ID },
      create: {
        id: USER_ID,
        businessId: A,
        name: 'Encargada de prueba',
        username: 'hu19.prueba',
        passwordHash: 'no-se-usa',
        role: 'ENCARGADO',
      },
      update: {},
    });

    const category = await prisma.category.create({ data: { businessId: A, name: 'General' } });
    const otherCategory = await prisma.category.create({
      data: { businessId: B, name: 'General' },
    });

    productId = (
      await prisma.product.create({
        data: {
          businessId: A,
          code: 'P001',
          name: 'Producto',
          price: '1000.00',
          cost: '600.00',
          stock: 100_000,
          categoryId: category.id,
        },
      })
    ).id;
    foreignProductId = (
      await prisma.product.create({
        data: {
          businessId: B,
          code: 'P001',
          name: 'Producto B',
          price: '1000.00',
          cost: '600.00',
          stock: 100_000,
          categoryId: otherCategory.id,
        },
      })
    ).id;
  });

  beforeEach(async () => {
    // Cada prueba parte de cero ventas y abonos; el catálogo y los negocios se conservan.
    await prisma.$executeRawUnsafe(
      'TRUNCATE "CreditPaymentOperation", "CreditPayment", "SaleAdjustmentItem", "SaleAdjustment", "SaleItem", "InventoryMovement", "Sale", "Customer", "DocumentSequence" CASCADE',
    );
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  describe('deuda y abonos básicos', () => {
    it('un cliente sin deuda no puede recibir abonos', async () => {
      const customer = await newCustomer();

      expect(await credit.getCredit(customer)).toMatchObject({
        balance: '0.00',
        hasCredit: false,
        fiados: [],
      });
      await expect(pay(customer, '100.00')).rejects.toMatchObject({
        statusCode: 409,
        message: 'Este cliente no tiene fiados pendientes.',
      });
      expect(await prisma.creditPaymentOperation.count()).toBe(0);
    });

    it('un cliente con una deuda: la ficha coincide con el saldo de HU-18', async () => {
      const customer = await newCustomer();
      const fiado = await fiar(customer, 10);
      const ficha = await credit.getCredit(customer);

      expect(ficha).toMatchObject({ balance: '10000.00', totalPaid: '0.00', settled: false });
      expect(ficha.fiados).toEqual([
        expect.objectContaining({
          saleId: fiado.id,
          number: fiado.number,
          pendingAmount: '10000.00',
          status: 'PENDING',
        }),
      ]);
      // El mismo número que muestra la caja.
      expect(
        (await customersService.listActiveCustomers()).find((c) => c.id === customer)?.balance,
      ).toBe('10000.00');
    });

    it('caso A, pago parcial: ₡4 000 de ₡10 000 dejan ₡6 000 y se guarda ligado a la venta', async () => {
      const customer = await newCustomer();
      const fiado = await fiar(customer, 10);
      const result = await pay(customer, '4000.00', { notes: 'Primer abono' });

      expect(result.credit).toMatchObject({
        balance: '6000.00',
        totalPaid: '4000.00',
        settled: false,
      });
      expect(result.credit.fiados[0]).toMatchObject({
        paidAmount: '4000.00',
        pendingAmount: '6000.00',
        status: 'PARTIAL',
      });

      const rows = await payments(customer);
      const operation = await prisma.creditPaymentOperation.findFirstOrThrow({
        where: { customerId: customer },
      });

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        saleId: fiado.id,
        operationId: operation.id,
        notes: 'Primer abono',
      });
      expect(operation).toMatchObject({
        businessId: A,
        createdById: USER_ID,
        notes: 'Primer abono',
      });
      expect(operation.totalAmount.toFixed(2)).toBe('4000.00');
      // Es el mismo saldo que ve la caja.
      expect(
        (await customersService.listActiveCustomers()).find((c) => c.id === customer)?.balance,
      ).toBe('6000.00');
    });

    it('caso B, pago exacto: la cuenta queda saldada automáticamente', async () => {
      const customer = await newCustomer();

      await fiar(customer, 10);

      const result = await pay(customer, '10000.00');

      expect(result.credit).toMatchObject({ balance: '0.00', settled: true });
      expect(result.credit.fiados.map((f) => f.status)).toEqual(['SETTLED']);
      // Saldada: no admite más abonos.
      await expect(pay(customer, '1.00')).rejects.toMatchObject({
        statusCode: 409,
        message: 'Este cliente no tiene fiados pendientes.',
      });
    });

    it('caso C, pago superior: se rechaza, se informa la diferencia y no se escribe nada', async () => {
      const customer = await newCustomer();

      await fiar(customer, 10);

      const before = await snapshot();

      await expect(pay(customer, '12000.00')).rejects.toMatchObject({
        statusCode: 409,
        details: { reason: 'EXCEEDS_DEBT', balance: '10000.00', excess: '2000.00' },
      });
      expect(await snapshot()).toEqual(before);
      // Ajustado a la deuda real, sí se acepta.
      expect((await pay(customer, '10000.00')).credit.settled).toBe(true);
    });

    it('la fecha del pago se guarda como el día elegido (hora de Costa Rica)', async () => {
      const customer = await newCustomer();

      await fiar(customer, 10);

      const result = await pay(customer, '1000.00', { paymentDate: today });

      expect(result.payment.paymentDate).toBe(today);

      const row = (await payments(customer))[0];

      // Se guarda a las 00:00 de Costa Rica (06:00 UTC) y se lee de vuelta como el mismo día.
      expect(row?.paymentDate.toISOString()).toBe(`${today}T06:00:00.000Z`);
      expect((await credit.listPayments(customer, ALL)).items[0]?.paymentDate).toBe(today);
    });

    it('una fecha futura, absurda o anterior al fiado se rechaza', async () => {
      const customer = await newCustomer();

      await fiar(customer, 10);
      await expect(pay(customer, '1.00', { paymentDate: '2999-01-01' })).rejects.toMatchObject({
        statusCode: 400,
      });
      await expect(pay(customer, '1.00', { paymentDate: '1999-01-01' })).rejects.toMatchObject({
        statusCode: 400,
      });
      await expect(pay(customer, '1.00', { paymentDate: '2020-01-01' })).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('anterior a la del fiado'),
      });
      expect(await prisma.creditPaymentOperation.count()).toBe(0);
    });

    it('monto cero, negativo o con decimales de más no pasan la validación', () => {
      const base = { idempotencyKey: randomUUID() };

      for (const amount of ['0', '0.00', '-100', '10.123', 'abc', '', '1e3']) {
        expect(registerPaymentSchema.safeParse({ ...base, amount }).success, amount).toBe(false);
      }

      expect(registerPaymentSchema.safeParse({ ...base, amount: '0.01' }).success).toBe(true);
    });

    it('la base impide una operación con monto cero aunque alguien se salte el servicio', async () => {
      const customer = await newCustomer();

      await expect(
        prisma.creditPaymentOperation.create({
          data: {
            businessId: A,
            customerId: customer,
            idempotencyKey: 'x',
            fingerprint: 'x',
            totalAmount: '0.00',
            paymentDate: new Date(),
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('varios fiados y FIFO', () => {
    it('₡7 000 con #12 (₡6 000) y #15 (₡3 000) saldan la primera y abonan la segunda, como UNA operación', async () => {
      const customer = await newCustomer();
      const first = await fiar(customer, 6);
      const second = await fiar(customer, 3);
      const result = await pay(customer, '7000.00', { notes: 'Quincena' });

      expect(result.payment.allocations.map((a) => [a.saleNumber, a.amount])).toEqual([
        [first.number, '6000.00'],
        [second.number, '1000.00'],
      ]);
      expect(result.credit).toMatchObject({ balance: '2000.00', settled: false });
      expect(result.credit.fiados.map((f) => [f.status, f.pendingAmount])).toEqual([
        ['SETTLED', '0.00'],
        ['PARTIAL', '2000.00'],
      ]);

      // En la base: UNA operación y DOS filas ligadas, cuya suma es el abono.
      const operations = await prisma.creditPaymentOperation.findMany({
        where: { customerId: customer },
      });
      const rows = await payments(customer);

      expect(operations).toHaveLength(1);
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((row) => row.operationId))).toEqual(new Set([operations[0]?.id]));
      expect(rows.map((row) => [row.saleId, row.amount.toFixed(2)])).toEqual([
        [first.id, '6000.00'],
        [second.id, '1000.00'],
      ]);
      expect(sum(rows)).toBe(Number(operations[0]?.totalAmount.toFixed(2)));

      // En el historial sigue siendo un solo abono.
      const history = (await credit.listPayments(customer, ALL)).items;

      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ kind: 'OPERATION', amount: '7000.00', notes: 'Quincena' });
    });

    it('el siguiente abono continúa donde quedó el anterior hasta saldar todo', async () => {
      const customer = await newCustomer();

      await fiar(customer, 6);
      await fiar(customer, 3);
      await pay(customer, '7000.00');

      const rest = await pay(customer, '2000.00');

      expect(rest.credit).toMatchObject({ balance: '0.00', settled: true });
      expect(rest.credit.fiados.map((f) => f.status)).toEqual(['SETTLED', 'SETTLED']);
      expect((await credit.listPayments(customer, ALL)).items.map((p) => p.amount)).toEqual([
        '2000.00',
        '7000.00',
      ]);
    });

    it('un abono a un fiado específico solo toca ese fiado', async () => {
      const customer = await newCustomer();

      await fiar(customer, 6);

      const second = await fiar(customer, 3);
      const result = await pay(customer, '1000.00', { saleId: second.id });

      expect(result.payment.allocations).toEqual([
        { saleId: second.id, saleNumber: second.number, amount: '1000.00' },
      ]);
      expect(result.credit.fiados.map((f) => f.paidAmount)).toEqual(['0.00', '1000.00']);
      // Más de lo pendiente de ese fiado se rechaza aunque el cliente deba más en total.
      await expect(pay(customer, '2500.00', { saleId: second.id })).rejects.toMatchObject({
        statusCode: 409,
        details: { reason: 'EXCEEDS_SALE' },
      });
    });
  });

  describe('concurrencia e idempotencia', () => {
    it('dos usuarios pagando ₡8 000 a la vez sobre ₡10 000: solo uno se confirma (5 rondas)', async () => {
      for (let round = 0; round < 5; round += 1) {
        const customer = await newCustomer(`Concurrente ${round}`);

        await fiar(customer, 10);

        const outcomes = await Promise.allSettled([
          pay(customer, '8000.00'),
          pay(customer, '8000.00'),
        ]);
        const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
        const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');

        expect(fulfilled, `ronda ${round}`).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
          statusCode: 409,
          message: expect.stringContaining('supera la deuda pendiente (₡2 000,00)'),
        });
        expect(sum(await payments(customer))).toBe(8000);
        expect((await credit.getCredit(customer)).balance).toBe('2000.00');
      }
    });

    it('tres abonos simultáneos de ₡4 000 sobre ₡10 000: se confirman exactamente dos', async () => {
      const customer = await newCustomer();

      await fiar(customer, 10);

      const outcomes = await Promise.allSettled([
        pay(customer, '4000.00'),
        pay(customer, '4000.00'),
        pay(customer, '4000.00'),
      ]);

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(2);
      expect(sum(await payments(customer))).toBe(8000);
      expect((await credit.getCredit(customer)).balance).toBe('2000.00');
    });

    it('el doble clic: cinco envíos simultáneos con la MISMA llave cobran una sola vez', async () => {
      const customer = await newCustomer();

      await fiar(customer, 10);

      const payload = request('3000.00', { notes: 'doble clic' });
      const results = await Promise.all(
        Array.from({ length: 5 }, () => credit.registerPayment(customer, payload, USER_ID)),
      );

      expect(results.filter((result) => !result.replayed)).toHaveLength(1);
      expect(results.filter((result) => result.replayed)).toHaveLength(4);
      expect(new Set(results.map((result) => result.payment.id)).size).toBe(1);
      expect(await prisma.creditPaymentOperation.count()).toBe(1);
      expect(sum(await payments(customer))).toBe(3000);
    });

    it('reintentar la misma operación después, incluso con la cuenta ya saldada, devuelve la original', async () => {
      const customer = await newCustomer();

      await fiar(customer, 5);

      const payload = request('5000.00');
      const first = await credit.registerPayment(customer, payload, USER_ID);
      const retry = await credit.registerPayment(customer, payload, USER_ID);

      expect(first.credit.settled).toBe(true);
      expect(retry.replayed).toBe(true);
      expect(retry.payment.id).toBe(first.payment.id);
      expect(await prisma.creditPaymentOperation.count()).toBe(1);
    });

    it('la misma llave con datos distintos se rechaza y no escribe nada', async () => {
      const customer = await newCustomer();
      const other = await newCustomer('Otro');

      await fiar(customer, 10);
      await fiar(other, 10);

      const key = randomUUID();

      await pay(customer, '1000.00', { idempotencyKey: key });

      for (const different of [
        { amount: '2000.00' },
        { notes: 'otra' },
        { paymentDate: '2020-01-01' },
      ]) {
        await expect(
          pay(customer, different.amount ?? '1000.00', { idempotencyKey: key, ...different }),
        ).rejects.toMatchObject({
          statusCode: 409,
          details: { reason: 'KEY_REUSED' },
        });
      }

      // Y la misma llave para otro cliente.
      await expect(pay(other, '1000.00', { idempotencyKey: key })).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(await prisma.creditPaymentOperation.count()).toBe(1);
    });

    it('un abono y una devolución simultáneos sobre el mismo fiado nunca dejan más abonado que el importe (5 rondas)', async () => {
      for (let round = 0; round < 5; round += 1) {
        const customer = await newCustomer(`Carrera ${round}`);
        const fiado = await fiar(customer, 10);
        const [payment, ret] = await Promise.allSettled([
          pay(customer, '10000.00'),
          sales.adjustSale(fiado.id, {
            type: 'RETURN',
            reason: 'carrera',
            items: [{ saleItemId: fiado.lineId, quantity: 3 }],
          }),
        ]);
        const sale = await prisma.sale.findUniqueOrThrow({ where: { id: fiado.id } });
        const paid = sum(await payments(customer));

        // Gana uno: o se pagó todo y la devolución se rechazó, o se devolvió y el pago completo se rechazó.
        expect([payment.status, ret.status].sort(), `ronda ${round}`).toEqual([
          'fulfilled',
          'rejected',
        ]);
        expect(paid).toBeLessThanOrEqual(Number(sale.total.toFixed(2)));
        expect((await credit.getCredit(customer)).balance).toMatch(/^\d+\.\d{2}$/);
        expect(Number((await credit.getCredit(customer)).balance)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('seguridad entre negocios y ventas', () => {
    it('un cliente de otro negocio no se consulta ni recibe abonos', async () => {
      const mine = await newCustomer();

      await fiar(mine, 10);

      const before = await snapshot();

      await expect(creditB.getCredit(mine)).rejects.toMatchObject({ statusCode: 404 });
      await expect(creditB.listPayments(mine, ALL)).rejects.toMatchObject({ statusCode: 404 });
      await expect(
        creditB.registerPayment(mine, request('1000.00'), USER_ID),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(await snapshot()).toEqual(before);
    });

    it('un abono no puede aplicarse a la venta de otro cliente ni a la de otro negocio', async () => {
      const customer = await newCustomer('Uno');
      const other = await newCustomer('Dos');
      const foreignCustomer = await newCustomer('Ajeno', B);

      await fiar(customer, 10);

      const sale = await fiar(other, 5);
      const foreignSale = (
        await new SalesService(new SalesRepository(B), new CustomersRepository(B)).createSale({
          idempotencyKey: randomUUID(),
          items: [{ productId: foreignProductId, quantity: 4 }],
          paymentMethod: 'CREDIT',
          customerId: foreignCustomer,
        })
      ).sale;

      for (const saleId of [sale.id, foreignSale.id, randomUUID()]) {
        await expect(pay(customer, '1000.00', { saleId })).rejects.toMatchObject({
          statusCode: 404,
        });
      }

      expect(await prisma.creditPayment.count()).toBe(0);
      // Y el abono a SU propia venta funciona.
      expect((await pay(other, '1000.00', { saleId: sale.id })).credit.balance).toBe('4000.00');
    });

    it('las ventas al contado no son fiados', async () => {
      const customer = await newCustomer();
      const cash = await sales.createSale({
        idempotencyKey: randomUUID(),
        items: [{ productId, quantity: 2 }],
        paymentMethod: 'CARD',
      });

      expect(await credit.getCredit(customer)).toMatchObject({ hasCredit: false });
      await expect(pay(customer, '1.00', { saleId: cash.sale.id })).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });

  describe('devoluciones y anulaciones (HU-35)', () => {
    it('devolver mercadería después de un abono baja el importe efectivo y la deuda, sin cobrar dos veces', async () => {
      const customer = await newCustomer();
      const fiado = await fiar(customer, 10);

      await pay(customer, '6000.00');
      // Devolución de ₡3 000: el importe efectivo pasa de ₡10 000 a ₡7 000.
      await sales.adjustSale(fiado.id, {
        type: 'RETURN',
        reason: 'Producto dañado',
        items: [{ saleItemId: fiado.lineId, quantity: 3 }],
      });

      const ficha = await credit.getCredit(customer);

      expect(ficha.balance).toBe('1000.00');
      expect(ficha.fiados[0]).toMatchObject({
        originalAmount: '10000.00',
        effectiveAmount: '7000.00',
        paidAmount: '6000.00',
        pendingAmount: '1000.00',
        status: 'PARTIAL',
      });
      // Lo que ya se pagó no se vuelve a cobrar y la deuda restante se puede liquidar.
      await expect(pay(customer, '1001.00')).rejects.toMatchObject({ statusCode: 409 });
      expect((await pay(customer, '1000.00')).credit.settled).toBe(true);
    });

    it('si la devolución dejaría más abonado que el nuevo importe se rechaza, sin tocar stock ni movimientos', async () => {
      const customer = await newCustomer();
      const fiado = await fiar(customer, 10);

      await pay(customer, '9000.00');

      const before = await snapshot();
      const movements = await prisma.inventoryMovement.count();

      // ₡9 000 abonados y una devolución de ₡3 000 dejarían el importe en ₡7 000.
      await expect(
        sales.adjustSale(fiado.id, {
          type: 'RETURN',
          reason: 'x',
          items: [{ saleItemId: fiado.lineId, quantity: 3 }],
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining(
          'ya tiene ₡9 000,00 abonados y su importe quedaría en ₡7 000,00',
        ),
        details: { reason: 'PAID_EXCEEDS' },
      });
      expect(await snapshot()).toEqual(before);
      expect(await prisma.inventoryMovement.count()).toBe(movements);
      expect(await prisma.saleAdjustment.count()).toBe(0);
      expect((await credit.getCredit(customer)).balance).toBe('1000.00');

      // Una devolución que no supera lo pagado (₡1 000) sí es posible.
      await sales.adjustSale(fiado.id, {
        type: 'RETURN',
        reason: 'y',
        items: [{ saleItemId: fiado.lineId, quantity: 1 }],
      });
      expect((await credit.getCredit(customer)).balance).toBe('0.00');
    });

    it('anular un fiado sin pagos lo borra de la deuda; con pagos se rechaza', async () => {
      const customer = await newCustomer();
      const unpaid = await fiar(customer, 4);
      const paid = await fiar(customer, 6);

      await pay(customer, '4000.00', { saleId: paid.id });
      await sales.adjustSale(unpaid.id, { type: 'VOID', reason: 'Error de caja' });

      expect((await credit.getCredit(customer)).fiados.map((f) => f.number)).toEqual([paid.number]);
      expect((await credit.getCredit(customer)).balance).toBe('2000.00');

      const before = await snapshot();

      await expect(
        sales.adjustSale(paid.id, { type: 'VOID', reason: 'Tarde' }),
      ).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('No se puede anular la venta'),
      });
      expect(await snapshot()).toEqual(before);
    });

    it('devolver todo un fiado sin pagos lo elimina de la deuda y el cliente queda sin fiados vigentes', async () => {
      const customer = await newCustomer();
      const fiado = await fiar(customer, 3);

      await sales.adjustSale(fiado.id, {
        type: 'RETURN',
        reason: 'Todo',
        items: [{ saleItemId: fiado.lineId, quantity: 3 }],
      });

      const ficha = await credit.getCredit(customer);

      expect(ficha).toMatchObject({ balance: '0.00', fiados: [], hasCredit: true, settled: true });
    });
  });

  describe('abonos históricos sin venta asignada', () => {
    it('se conservan, descuentan el saldo y no se atribuyen a ningún fiado', async () => {
      const customer = await newCustomer();
      const first = await fiar(customer, 6);

      await fiar(customer, 3);
      // Un abono general de antes de HU-19: sin venta ni operación.
      const legacy = await prisma.creditPayment.create({
        data: { customerId: customer, amount: '2000.00', notes: 'anterior' },
      });
      const ficha = await credit.getCredit(customer);

      expect(ficha).toMatchObject({
        balance: '7000.00',
        totalPaid: '2000.00',
        unassignedPaid: '2000.00',
      });
      expect(ficha.fiados.map((f) => f.paidAmount)).toEqual(['0.00', '0.00']);
      expect((await credit.listPayments(customer, ALL)).items[0]).toMatchObject({
        kind: 'LEGACY',
        amount: '2000.00',
        allocations: [],
      });

      // Solo se puede pagar el saldo real (₡7 000), y el reparto sigue sin tocar el abono anterior.
      await expect(pay(customer, '7001.00')).rejects.toMatchObject({ statusCode: 409 });

      const result = await pay(customer, '7000.00');

      expect(result.credit).toMatchObject({ balance: '0.00', settled: true });
      expect(result.payment.allocations.map((a) => [a.saleNumber, a.amount])).toEqual([
        [first.number, '6000.00'],
        [first.number + 1, '1000.00'],
      ]);
      // El abono anterior sigue exactamente igual: sin venta, sin operación.
      expect(
        await prisma.creditPayment.findUniqueOrThrow({ where: { id: legacy.id } }),
      ).toMatchObject({ saleId: null, operationId: null });
    });

    it('una devolución que dejaría más abonado (incluidos los abonos anteriores) que lo fiado se rechaza', async () => {
      const customer = await newCustomer();
      const fiado = await fiar(customer, 5);

      await prisma.creditPayment.create({ data: { customerId: customer, amount: '4000.00' } });
      await expect(
        sales.adjustSale(fiado.id, {
          type: 'RETURN',
          reason: 'x',
          items: [{ saleItemId: fiado.lineId, quantity: 3 }],
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('el cliente ya abonó ₡4 000,00'),
      });
    });
  });

  describe('consistencia', () => {
    it('tras muchas operaciones el saldo coincide en la ficha, la caja, el historial, HU-30 y la base', async () => {
      const customer = await newCustomer('Consistente');
      const a = await fiar(customer, 6);
      const b = await fiar(customer, 4);

      await pay(customer, '2500.00');
      await sales.adjustSale(b.id, {
        type: 'RETURN',
        reason: 'r',
        items: [{ saleItemId: b.lineId, quantity: 1 }],
      });
      await pay(customer, '1500.00', { saleId: b.id });

      const c = await fiar(customer, 2);

      await pay(customer, '3000.00');
      await sales.adjustSale(c.id, { type: 'VOID', reason: 'v' });
      await prisma.creditPayment.create({ data: { customerId: customer, amount: '500.00' } });

      const ficha = await credit.getCredit(customer);
      const history = (await credit.listPayments(customer, ALL)).items;
      const debts = await reports.customerDebts();
      const dbSales = await prisma.sale.findMany({
        where: { customerId: customer, paymentMethod: 'CREDIT' },
      });
      const dbBalance =
        sum(dbSales.map((sale) => ({ amount: sale.total }))) - sum(await payments(customer));

      // Efectivo: #a 6 000 + #b 3 000 (devolvió ₡1 000) + #c 0 (anulada) = ₡9 000. Abonado: 2 500 + 1 500 + 3 000 + 500.
      expect(ficha.balance).toBe('1500.00');
      expect(String(dbBalance.toFixed(2))).toBe('1500.00');
      expect(
        (await customersService.listActiveCustomers()).find((x) => x.id === customer)?.balance,
      ).toBe('1500.00');
      expect(sum(history.map((entry) => ({ amount: { toFixed: () => entry.amount } })))).toBe(7500);
      expect(
        debts.rows.filter((row) => row['customer'] === 'Consistente').at(-1)?.['balance'],
      ).toBe('1500.00');
      expect(total(debts, 'Total general de deudas')).toBe('1500.00');
      expect(a.number).toBeLessThan(b.number);
    });

    it('HU-30 refleja los saldos: ventas de ₡6 000 y ₡4 000 con un abono de ₡8 000 dejan ₡2 000 pendientes', async () => {
      const customer = await newCustomer('Doña Marta');
      const saleA = await fiar(customer, 6);
      const saleB = await fiar(customer, 4);

      expect(total(await reports.customerDebts(), 'Total general de deudas')).toBe('10000.00');
      await pay(customer, '8000.00');

      const report = await reports.customerDebts();
      const ficha = await credit.getCredit(customer);

      expect(
        report.rows.map((row) => [row['customer'], row['sale'], row['pending'], row['balance']]),
      ).toEqual([['Doña Marta', `#${saleB.number}`, '2000.00', '2000.00']]);
      expect(report.rows.some((row) => row['sale'] === `#${saleA.number}`)).toBe(false);
      expect(total(report, 'Total general de deudas')).toBe('2000.00');
      // La ficha, la base y el reporte dicen lo mismo.
      expect(ficha.balance).toBe('2000.00');
      expect(ficha.fiados.map((f) => [f.number, f.pendingAmount])).toEqual([
        [saleA.number, '0.00'],
        [saleB.number, '2000.00'],
      ]);
      expect(sum(await payments(customer))).toBe(8000);

      // Al liquidar, el cliente sale del reporte.
      await pay(customer, '2000.00');
      expect((await reports.customerDebts()).emptyMessage).toBe(
        'No hay clientes con deudas pendientes.',
      );
      expect((await reports.customerDebts()).rows).toEqual([]);
    });

    it('HU-30 reconoce los abonos anteriores sin venta en su línea aparte', async () => {
      const customer = await newCustomer('Con historia');

      await fiar(customer, 5);
      await prisma.creditPayment.create({ data: { customerId: customer, amount: '1000.00' } });

      const report = await reports.customerDebts();

      expect(report.rows.at(-1)).toMatchObject({
        sale: 'Abonos sin venta asignada',
        pending: '-1000.00',
        balance: '4000.00',
      });
    });
  });

  describe('HU-29 ganancias', () => {
    it('un fiado se incluye solo cuando queda liquidado, sin duplicar ingresos', async () => {
      const customer = await newCustomer();

      await fiar(customer, 10);

      const period = { from: today, to: today };

      // Sin pagar: excluido.
      let profits = await reports.profits(period);

      expect(total(profits, 'Ganancia bruta')).toBe('0.00');
      expect(total(profits, 'Fiados excluidos (pendientes)')).toBe(1);
      expect(total(profits, 'Monto de fiados excluidos')).toBe('10000.00');

      // Pago parcial: sigue excluido (no se sabe qué productos cubrió) y se informa.
      await pay(customer, '6000.00');
      profits = await reports.profits(period);
      expect(total(profits, 'Ganancia bruta')).toBe('0.00');
      expect(total(profits, 'Fiados excluidos (pendientes)')).toBe(1);
      expect(profits.rows).toEqual([]);

      // Liquidado: entra completo, una sola vez: 10 × (₡1 000 − ₡600).
      await pay(customer, '4000.00');
      profits = await reports.profits(period);
      expect(total(profits, 'Ingresos considerados')).toBe('10000.00');
      expect(total(profits, 'Costos correspondientes')).toBe('6000.00');
      expect(total(profits, 'Ganancia bruta')).toBe('4000.00');
      expect(total(profits, 'Ventas consideradas')).toBe(1);
      expect(total(profits, 'Fiados excluidos (pendientes)')).toBe(0);
      expect(profits.rows).toHaveLength(1);
      expect(profits.rows[0]).toMatchObject({
        payment: 'Fiado cobrado',
        netUnits: 10,
        profit: '4000.00',
      });

      // Otro abono ya no existe (saldado) y el reporte no cambia al consultarlo otra vez.
      expect(total(await reports.profits(period), 'Ganancia bruta')).toBe('4000.00');
    });

    it('un fiado liquidado con una devolución parcial ajusta cantidades y margen; el anulado nunca entra', async () => {
      const customer = await newCustomer();
      const fiado = await fiar(customer, 10);

      await pay(customer, '6000.00');
      await sales.adjustSale(fiado.id, {
        type: 'RETURN',
        reason: 'r',
        items: [{ saleItemId: fiado.lineId, quantity: 3 }],
      });
      await pay(customer, '1000.00');

      // Efectivo ₡7 000 y 7 unidades netas: 7 × (₡1 000 − ₡600) = ₡2 800.
      const profits = await reports.profits({ from: today, to: today });

      expect(total(profits, 'Ganancia bruta')).toBe('2800.00');
      expect(profits.rows[0]).toMatchObject({ netUnits: 7 });

      const voided = await fiar(await newCustomer('Anulado'), 2);

      await sales.adjustSale(voided.id, { type: 'VOID', reason: 'v' });
      expect(total(await reports.profits({ from: today, to: today }), 'Ganancia bruta')).toBe(
        '2800.00',
      );
    });

    it('los avisos ya no dicen que falta el flujo de abonos, pero conservan la advertencia de costos', async () => {
      const notices = (await reports.profits({ from: today, to: today })).notices.join(' ');
      const debtNotices = (await reports.customerDebts()).notices.join(' ');

      expect(notices).not.toContain('todavía no existe el flujo');
      expect(debtNotices).not.toContain('todavía no existe el flujo');
      expect(notices).toContain('costo desconocido');
      expect(notices).toContain('pago PARCIAL');
    });
  });

  describe('solo lectura', () => {
    it('consultar la deuda, el historial y los reportes no modifica nada', async () => {
      const customer = await newCustomer();

      await fiar(customer, 10);
      await pay(customer, '3000.00');

      const before = await snapshot();

      await credit.getCredit(customer);
      await credit.listPayments(customer, ALL);
      await reports.customerDebts();
      await reports.profits({ from: today, to: today });
      await customersService.listActiveCustomers();
      expect(await snapshot()).toEqual(before);
    });
  });
});
