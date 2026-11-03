import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { disconnectPrisma, prisma } from '../config/prisma.js';
import { ReportsService } from '../services/reports.service.js';
import type { ReportFilter, ReportResult } from '../types/reports.js';
import { formatCents, toCents } from '../utils/money.js';
import { ReportsRepository } from './reports.repository.js';
import { SalesRepository } from './sales.repository.js';

/**
 * Reportes comerciales (HU-28, HU-29, HU-30) contra PostgreSQL real: período en
 * hora de Costa Rica, precios históricos, anulaciones y devoluciones reales
 * (`SalesRepository.adjustSale`), fiados y aislamiento entre negocios.
 *
 * Borra datos: solo corre si DATABASE_URL apunta a una base `*_test`.
 */
const databaseName = new URL(process.env['DATABASE_URL'] ?? 'postgresql://x/none').pathname;

const A = '0b000000-0000-4000-8000-0000000000c1';
const B = '0b000000-0000-4000-8000-0000000000d1';
const OCTOBER: ReportFilter = { from: '2026-10-01', to: '2026-10-31' };

/** Instante en hora de Costa Rica (UTC−6, sin horario de verano). */
const cr = (local: string) => new Date(`${local}-06:00`);

const total = (report: ReportResult, label: string) =>
  report.totals.find((entry) => entry.label === label)?.value;

describe.skipIf(!databaseName.endsWith('_test'))(
  'Reportes comerciales (PostgreSQL de prueba)',
  () => {
    const service = new ReportsService(new ReportsRepository(A));
    const salesA = new SalesRepository(A);

    const ids: Record<string, string> = {};
    let number = 0;

    interface SellInput {
      business?: string;
      at: string;
      payment?: 'CASH' | 'CARD' | 'CREDIT';
      customerId?: string;
      items: { product: string; quantity: number; price: string; cost: string }[];
      linkedPayment?: string;
    }

    /** Venta con sus líneas (precio y costo HISTÓRICOS); devuelve su id y el de cada línea. */
    async function sell(input: SellInput) {
      const businessId = input.business ?? A;
      const sum = input.items.reduce(
        (acc, item) => acc + toCents(item.price) * BigInt(item.quantity),
        0n,
      );
      number += 1;

      const created = await prisma.sale.create({
        data: {
          businessId,
          number,
          createdAt: cr(input.at),
          paymentMethod: input.payment ?? 'CASH',
          total: formatCents(sum),
          customerId: input.customerId ?? null,
          items: {
            create: input.items.map((item) => ({
              productId: ids[item.product] ?? '',
              quantity: item.quantity,
              unitPrice: item.price,
              unitCost: item.cost,
            })),
          },
          ...(input.linkedPayment === undefined || input.customerId === undefined
            ? {}
            : {
                creditPayments: {
                  create: { customerId: input.customerId, amount: input.linkedPayment },
                },
              }),
        },
        select: { id: true, items: { select: { id: true, productId: true } } },
      });

      return created;
    }

    const lineOf = (sale: Awaited<ReturnType<typeof sell>>, product: string) =>
      sale.items.find((item) => item.productId === ids[product])?.id ?? '';

    beforeAll(async () => {
      await prisma.$executeRawUnsafe(
        'TRUNCATE "SaleAdjustmentItem", "SaleAdjustment", "SaleItem", "InventoryMovement", "CreditPayment", "Sale", "Customer", "Product", "Category", "DocumentSequence" CASCADE',
      );

      for (const [id, name] of [
        [A, 'Negocio A'],
        [B, 'Negocio B'],
      ] as const) {
        await prisma.business.upsert({
          where: { id },
          create: { id, name },
          update: { name },
        });
      }

      const granos = await prisma.category.create({ data: { businessId: A, name: 'Granos' } });
      const bebidas = await prisma.category.create({ data: { businessId: A, name: 'Bebidas' } });
      const otherCategory = await prisma.category.create({
        data: { businessId: B, name: 'Granos' },
      });

      ids['granos'] = granos.id;
      ids['bebidas'] = bebidas.id;
      ids['otherCategory'] = otherCategory.id;

      // El precio y costo ACTUALES del catálogo no coinciden con los de las ventas, a propósito.
      const products = [
        { business: A, key: 'A1', name: 'Arroz', category: granos.id, isActive: true },
        { business: A, key: 'B1', name: 'Café', category: bebidas.id, isActive: true },
        { business: A, key: 'Z1', name: 'Descontinuado', category: granos.id, isActive: false },
        {
          business: B,
          key: 'X1',
          name: 'Producto de B',
          category: otherCategory.id,
          isActive: true,
        },
      ];

      for (const product of products) {
        const created = await prisma.product.create({
          data: {
            businessId: product.business,
            code: product.key,
            name: product.name,
            price: '5000.00',
            cost: '4000.00',
            stock: 100,
            categoryId: product.category,
            isActive: product.isActive,
          },
        });

        ids[product.key] = created.id;
      }

      for (const [key, business, name, isActive] of [
        ['ana', A, 'Ana', true],
        ['zoila', A, 'Zoila (inactiva)', false],
        ['beto', A, 'Beto', true],
        ['carla', A, 'Carla', true],
        ['foreign', B, 'Cliente de B', true],
      ] as const) {
        ids[key] = (
          await prisma.customer.create({ data: { businessId: business, name, isActive } })
        ).id;
      }

      // --- Negocio A, octubre de 2026 (hora de Costa Rica) ---
      const s1 = await sell({
        at: '2026-10-10T12:00:00',
        items: [
          { product: 'A1', quantity: 3, price: '900.00', cost: '700.00' },
          { product: 'B1', quantity: 2, price: '1234.50', cost: '999.05' },
        ],
      });
      const s2 = await sell({
        at: '2026-10-11T12:00:00',
        payment: 'CARD',
        items: [{ product: 'A1', quantity: 1, price: '900.00', cost: '700.00' }],
      });
      const s3 = await sell({
        at: '2026-10-12T12:00:00',
        items: [{ product: 'Z1', quantity: 2, price: '100.00', cost: '50.00' }],
      });

      await sell({
        at: '2026-10-31T23:59:59',
        items: [{ product: 'B1', quantity: 1, price: '1500.00', cost: '1000.00' }],
      });
      // Fuera del período: un segundo después del último día y un segundo antes del primero.
      await sell({
        at: '2026-11-01T00:00:00',
        items: [{ product: 'A1', quantity: 1, price: '900.00', cost: '700.00' }],
      });
      await sell({
        at: '2026-10-01T00:00:00',
        items: [{ product: 'Z1', quantity: 4, price: '100.00', cost: '50.00' }],
      });
      await sell({
        at: '2026-09-30T23:59:59',
        items: [{ product: 'A1', quantity: 1, price: '900.00', cost: '700.00' }],
      });

      // Fiados de Ana: uno pendiente y uno con un abono ligado que lo cubre.
      await sell({
        at: '2026-10-15T12:00:00',
        payment: 'CREDIT',
        customerId: ids['ana'] ?? '',
        items: [{ product: 'A1', quantity: 1, price: '1000.00', cost: '700.00' }],
      });
      await sell({
        at: '2026-10-16T12:00:00',
        payment: 'CREDIT',
        customerId: ids['ana'] ?? '',
        linkedPayment: '500.00',
        items: [{ product: 'B1', quantity: 1, price: '500.00', cost: '300.00' }],
      });
      // Un fiado de una cliente inactiva.
      await sell({
        at: '2026-10-17T12:00:00',
        payment: 'CREDIT',
        customerId: ids['zoila'] ?? '',
        items: [{ product: 'B1', quantity: 1, price: '200.00', cost: '100.00' }],
      });

      // Beto: fiado de 2 unidades con 1 devuelta. Carla: fiado anulado.
      const beto = await sell({
        at: '2026-10-18T12:00:00',
        payment: 'CREDIT',
        customerId: ids['beto'] ?? '',
        items: [{ product: 'B1', quantity: 2, price: '400.00', cost: '250.00' }],
      });
      const carla = await sell({
        at: '2026-10-19T12:00:00',
        payment: 'CREDIT',
        customerId: ids['carla'] ?? '',
        items: [{ product: 'B1', quantity: 1, price: '300.00', cost: '150.00' }],
      });

      // Devoluciones y anulaciones REALES del dominio (reducen Sale.total y dejan el ajuste).
      await salesA.adjustSale({
        saleId: s1.id,
        type: 'RETURN',
        reason: 'Empaque dañado',
        items: [{ saleItemId: lineOf(s1, 'A1'), quantity: 1 }],
      });
      await salesA.adjustSale({ saleId: s2.id, type: 'VOID', reason: 'Error de caja' });
      await salesA.adjustSale({
        saleId: s3.id,
        type: 'RETURN',
        reason: 'Devolución total',
        items: [{ saleItemId: lineOf(s3, 'Z1'), quantity: 2 }],
      });
      await salesA.adjustSale({
        saleId: beto.id,
        type: 'RETURN',
        reason: 'Una unidad',
        items: [{ saleItemId: lineOf(beto, 'B1'), quantity: 1 }],
      });
      await salesA.adjustSale({ saleId: carla.id, type: 'VOID', reason: 'Fiado por error' });

      // --- Negocio B: mismos códigos y cifras enormes que NUNCA deben verse en A ---
      await sell({
        business: B,
        at: '2026-10-10T12:00:00',
        items: [{ product: 'X1', quantity: 1, price: '99999.00', cost: '1.00' }],
      });
      await sell({
        business: B,
        at: '2026-10-11T12:00:00',
        payment: 'CREDIT',
        customerId: ids['foreign'] ?? '',
        items: [{ product: 'X1', quantity: 1, price: '7777.00', cost: '1.00' }],
      });
    });

    afterAll(async () => {
      await disconnectPrisma();
    });

    describe('HU-28 ventas', () => {
      it('suma lo vendido con precios históricos, sin anuladas y descontando devoluciones', async () => {
        const report = await service.sales(OCTOBER);

        // #1: 1800 + 2469 | #4: 1500 | #6: 400 | fiados: 1000 + 500 + 200 + Beto 400 (1 de 2 devuelta).
        // La venta #2 (anulada) no cuenta; la #3 se devolvió entera; Carla (anulada) tampoco.
        expect(total(report, 'Total vendido (neto)')).toBe('8269.00');
        expect(total(report, 'Importe original')).toBe('9769.00');
        expect(total(report, 'Devuelto')).toBe('1500.00');
        // S1, S4, S6, Ana×2, Zoila y Beto: la devuelta (#3) y la anulada (#2) no son transacciones.
        expect(total(report, 'Transacciones')).toBe(7);
        expect(report.rows.some((row) => row['sale'] === '#2')).toBe(false);
      });

      it('una venta con varios productos cuenta como UNA transacción', async () => {
        const report = await service.sales(OCTOBER);
        const first = report.rows.filter((row) => row['sale'] === '#1');

        expect(first).toHaveLength(2);
        expect(first.map((row) => row['code']).sort()).toEqual(['A1', 'B1']);
        // Una devolución parcial ajusta cantidades e importes de la línea.
        expect(first.find((row) => row['code'] === 'A1')).toMatchObject({
          soldUnits: 3,
          returnedUnits: 1,
          netUnits: 2,
          net: '1800.00',
        });
      });

      it('incluye el último día completo y el primero desde las 00:00 de Costa Rica, y deja fuera lo demás', async () => {
        const report = await service.sales(OCTOBER);
        const dates = report.rows.map((row) => String(row['date']));

        expect(dates).toContain('2026-10-31 23:59');
        expect(dates).toContain('2026-10-01 00:00');
        expect(dates).not.toContain('2026-11-01 00:00');
        expect(dates).not.toContain('2026-09-30 23:59');
      });

      it('filtra por la categoría ACTUAL del producto', async () => {
        const report = await service.sales({ ...OCTOBER, categoryId: ids['granos'] ?? '' });

        // Granos = Arroz y Descontinuado: #1 (1800), #3 devuelta, #6 (400), Ana A1 (1000).
        expect(total(report, 'Total vendido (neto)')).toBe('3200.00');
        expect(total(report, 'Transacciones')).toBe(3);
        expect(new Set(report.rows.map((row) => row['category']))).toEqual(new Set(['Granos']));

        // Si el producto cambia de categoría, la venta antigua se mueve con él (límite documentado).
        await prisma.product.update({
          where: { id: ids['A1'] ?? '' },
          data: { categoryId: ids['bebidas'] ?? '' },
        });

        const moved = await service.sales({ ...OCTOBER, categoryId: ids['granos'] ?? '' });

        expect(total(moved, 'Total vendido (neto)')).toBe('400.00');

        await prisma.product.update({
          where: { id: ids['A1'] ?? '' },
          data: { categoryId: ids['granos'] ?? '' },
        });
      });

      it('filtra por el precio HISTÓRICO de la línea y combina filtros', async () => {
        const range = await service.sales({ ...OCTOBER, minPrice: '1000', maxPrice: '1500' });

        // El catálogo hoy vale 5000: solo cuenta lo que se cobró al vender (B1 1234.50, B1 1500, A1 1000).
        expect(range.rows.map((row) => row['price']).sort()).toEqual([
          '1000.00',
          '1234.50',
          '1500.00',
        ]);
        expect(total(range, 'Total vendido (neto)')).toBe('4969.00');
        expect(total(range, 'Transacciones')).toBe(3);

        const combined = await service.sales({
          ...OCTOBER,
          categoryId: ids['granos'] ?? '',
          minPrice: '1000',
        });

        expect(total(combined, 'Total vendido (neto)')).toBe('1000.00');
        expect(total(combined, 'Transacciones')).toBe(1);
      });

      it('sin coincidencias devuelve el estado vacío con totales en cero', async () => {
        const report = await service.sales({ ...OCTOBER, minPrice: '90000' });

        expect(report.rows).toEqual([]);
        expect(total(report, 'Total vendido (neto)')).toBe('0.00');
        expect(total(report, 'Transacciones')).toBe(0);
      });

      it('no ve lo vendido por otro negocio ni acepta su categoría', async () => {
        const report = await service.sales({ from: '2026-01-01', to: '2026-12-31' });

        expect(report.rows.some((row) => row['code'] === 'X1')).toBe(false);
        expect(report.businessName).toBe('Negocio A');
        await expect(
          service.sales({ ...OCTOBER, categoryId: ids['otherCategory'] ?? '' }),
        ).rejects.toMatchObject({ statusCode: 404 });
      });
    });

    describe('HU-29 ganancias', () => {
      it('calcula con precio y costo históricos, descontando devoluciones y sin fiados sin cobro', async () => {
        const report = await service.profits(OCTOBER);

        // Contado: #1 (A1 2×200 + B1 2×235.45) | #4 500 | #6 200, más el fiado de Ana cubierto por su abono (200).
        expect(total(report, 'Ingresos considerados')).toBe('6669.00');
        expect(total(report, 'Costos correspondientes')).toBe('4898.10');
        expect(total(report, 'Ganancia bruta')).toBe('1770.90');
        expect(total(report, 'Ventas consideradas')).toBe(4);
      });

      it('excluye los fiados pendientes aunque el cliente tenga abonos generales', async () => {
        // Un abono general NO se atribuye a ninguna venta.
        const general = await prisma.creditPayment.create({
          data: { customerId: ids['zoila'] ?? '', amount: '200.00' },
        });
        const report = await service.profits(OCTOBER);

        // Ana #1 (1000), Zoila (200, sin abono ligado) y Beto (400 efectivos).
        expect(total(report, 'Fiados excluidos (pendientes)')).toBe(3);
        expect(total(report, 'Monto de fiados excluidos')).toBe('1600.00');
        expect(total(report, 'Ganancia bruta')).toBe('1770.90');

        await prisma.creditPayment.delete({ where: { id: general.id } });
      });

      it('una venta anulada o devuelta por completo no produce ganancia', async () => {
        const report = await service.profits(OCTOBER);
        const sales = report.rows.map((row) => row['sale']);

        expect(sales).not.toContain('#2');
        expect(sales).not.toContain('#3');
      });

      it('un abono ligado que cubre el fiado lo vuelve ganancia cobrada', async () => {
        const zoila = await prisma.sale.findFirstOrThrow({
          where: { businessId: A, customerId: ids['zoila'] ?? '' },
          select: { id: true },
        });
        const payment = await prisma.creditPayment.create({
          data: { customerId: ids['zoila'] ?? '', saleId: zoila.id, amount: '200.00' },
        });
        const report = await service.profits(OCTOBER);

        // Se suma B1 a (200 − 100) = 100.
        expect(total(report, 'Ganancia bruta')).toBe('1870.90');
        expect(total(report, 'Fiados excluidos (pendientes)')).toBe(2);

        await prisma.creditPayment.delete({ where: { id: payment.id } });
      });
    });

    describe('HU-30 productos más vendidos', () => {
      it('ordena por unidades netas, mantiene productos desactivados y excluye lo devuelto o anulado', async () => {
        const report = await service.topProducts(OCTOBER);

        // B1: #1 2 + #4 1 + Ana 1 + Zoila 1 + Beto 1 = 6 | Z1 (desactivado): #6 4 | A1: #1 2 + Ana 1 = 3.
        expect(report.rows.map((row) => [row['position'], row['code'], row['units']])).toEqual([
          [1, 'B1', 6],
          [2, 'Z1', 4],
          [3, 'A1', 3],
        ]);
        expect(report.rows[1]).toMatchObject({ product: 'Descontinuado', category: 'Granos' });
        // El importe usa el precio histórico: B1 2469 + 1500 + 500 + 200 + 400.
        expect(report.rows[0]?.['amount']).toBe('5069.00');
      });

      it('respeta el período y no mezcla negocios', async () => {
        const report = await service.topProducts({ from: '2026-11-01', to: '2026-11-30' });

        expect(report.rows.map((row) => row['code'])).toEqual(['A1']);
        expect(report.rows.some((row) => row['code'] === 'X1')).toBe(false);
      });
    });

    describe('HU-30 deudas de clientes', () => {
      it('calcula los saldos con las ventas vigentes (devoluciones y anulaciones) y los abonos', async () => {
        const report = await service.customerDebts();

        // Ana 1500 − 500 = 1000 | Beto 800 → 400 por la devolución | Zoila (inactiva) 200 | Carla anulada: 0.
        expect(report.rows.map((row) => [row['customer'], row['sale'], row['pending']])).toEqual([
          ['Ana', expect.stringMatching(/^#\d+$/), '1000.00'],
          ['Beto', expect.stringMatching(/^#\d+$/), '400.00'],
          ['Zoila (inactiva)', expect.stringMatching(/^#\d+$/), '200.00'],
        ]);
        expect(total(report, 'Total general de deudas')).toBe('1600.00');
        expect(total(report, 'Clientes con deuda')).toBe(3);
        expect(report.rows.some((row) => row['customer'] === 'Carla')).toBe(false);
        expect(report.rows.some((row) => row['customer'] === 'Cliente de B')).toBe(false);
      });

      it('refleja al instante un fiado nuevo y un abono, sin guardar saldos', async () => {
        const sale = await sell({
          at: '2026-10-25T12:00:00',
          payment: 'CREDIT',
          customerId: ids['ana'] ?? '',
          items: [{ product: 'B1', quantity: 1, price: '300.00', cost: '150.00' }],
        });
        const payment = await prisma.creditPayment.create({
          data: { customerId: ids['ana'] ?? '', amount: '100.00' },
        });
        const report = await service.customerDebts();
        const ana = report.rows.filter((row) => row['customer'] === 'Ana');

        // Ana ahora debe 1500 + 300 − 500 − 100 = 1200; el abono general se descuenta aparte.
        expect(ana.at(-1)).toMatchObject({
          sale: 'Abonos sin venta asignada',
          pending: '-100.00',
          balance: '1200.00',
        });
        expect(total(report, 'Total general de deudas')).toBe('1800.00');

        await prisma.creditPayment.delete({ where: { id: payment.id } });
        await prisma.sale.delete({ where: { id: sale.id } });

        expect(total(await service.customerDebts(), 'Total general de deudas')).toBe('1600.00');
      });

      it('sin deudas muestra el mensaje y total cero', async () => {
        const empty = new ReportsService(
          new ReportsRepository('0b000000-0000-4000-8000-0000000000e1'),
        );

        await prisma.business.upsert({
          where: { id: '0b000000-0000-4000-8000-0000000000e1' },
          create: { id: '0b000000-0000-4000-8000-0000000000e1', name: 'Negocio vacío' },
          update: {},
        });

        const report = await empty.customerDebts();

        expect(report.rows).toEqual([]);
        expect(report.emptyMessage).toBe('No hay clientes con deudas pendientes.');
        expect(total(report, 'Total general de deudas')).toBe('0.00');
      });
    });
  },
);
