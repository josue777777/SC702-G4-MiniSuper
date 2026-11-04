import { describe, expect, it } from 'vitest';
import { FakeReportsRepository, decimal, line, sale } from '../testing/reports.repository.fake.js';
import type { ReportFilter, ReportResult } from '../types/reports.js';
import { ReportsService } from './reports.service.js';

/**
 * Reportes comerciales (HU-28, HU-29, HU-30): reglas de cálculo con un
 * repositorio falso. Las cifras esperadas están calculadas a mano.
 */

const PERIOD: ReportFilter = { from: '2026-10-01', to: '2026-10-31' };

function build(salesData?: Partial<FakeReportsRepository['salesData']>) {
  const repository = new FakeReportsRepository();

  Object.assign(repository.salesData, salesData);

  return { repository, service: new ReportsService(repository as never) };
}

const total = (report: ReportResult, label: string) =>
  report.totals.find((entry) => entry.label === label)?.value;

describe('HU-28 — reporte de ventas', () => {
  const sales = [
    sale({
      id: 's1',
      number: 1,
      at: '2026-10-10T18:00:00Z',
      total: '4269.00',
      items: [
        // 3 vendidas, 1 devuelta → 2 netas.
        line({
          code: 'A1',
          name: 'Arroz',
          category: 'Granos',
          quantity: 3,
          price: '900.00',
          cost: '700.00',
          returned: [1],
        }),
        line({
          code: 'B1',
          name: 'Café',
          category: 'Bebidas',
          quantity: 2,
          price: '1234.50',
          cost: '999.05',
        }),
      ],
    }),
    // Devuelta por completo: aparece, pero ya no es una venta.
    sale({
      id: 's2',
      number: 2,
      at: '2026-10-09T18:00:00Z',
      total: '0.00',
      items: [line({ code: 'C1', quantity: 1, price: '500.00', cost: '300.00', returned: [1] })],
    }),
  ];

  it('suma importes netos con precios históricos y cuenta cada venta una sola vez', async () => {
    const { service } = build({ sales });

    const report = await service.sales(PERIOD);

    expect(total(report, 'Total vendido (neto)')).toBe('4269.00');
    expect(total(report, 'Importe original')).toBe('5669.00');
    expect(total(report, 'Devuelto')).toBe('1400.00');
    // La venta #1 tiene dos líneas y cuenta una vez; la #2 se devolvió entera y no cuenta.
    expect(total(report, 'Transacciones')).toBe(1);
    expect(total(report, 'Unidades netas')).toBe(4);
    expect(report.rows).toHaveLength(3);
    expect(report.rows[0]).toMatchObject({
      sale: '#1',
      date: '2026-10-10 12:00',
      code: 'A1',
      price: '900.00',
      soldUnits: 3,
      returnedUnits: 1,
      netUnits: 2,
      net: '1800.00',
    });
  });

  it('calcula en céntimos exactos, sin errores de punto flotante', async () => {
    const { service } = build({
      sales: [
        sale({
          id: 's1',
          number: 1,
          at: '2026-10-10T18:00:00Z',
          total: '0.30',
          items: [line({ code: 'D1', quantity: 3, price: '0.10', cost: '0.07' })],
        }),
      ],
    });

    const report = await service.sales(PERIOD);

    expect(total(report, 'Total vendido (neto)')).toBe('0.30');
  });

  it('pide al repositorio desde el inicio del primer día hasta el final del último, hora de Costa Rica', async () => {
    const { service, repository } = build();

    await service.sales({ from: '2026-10-01', to: '2026-10-31' });

    expect(repository.salesCalls[0]?.start.toISOString()).toBe('2026-10-01T06:00:00.000Z');
    expect(repository.salesCalls[0]?.end.toISOString()).toBe('2026-11-01T06:00:00.000Z');
  });

  it('describe los filtros aplicados y el estado vacío', async () => {
    const { service } = build({ categoryName: 'Granos' });

    const report = await service.sales({
      ...PERIOD,
      categoryId: '0c000000-0000-4000-8000-000000000001',
      minPrice: '500',
      maxPrice: '1500.5',
    });

    expect(report.filters.every((entry) => entry.isDefault === undefined)).toBe(true);
    expect(report.filters).toEqual([
      { label: 'Desde', value: '2026-10-01' },
      { label: 'Hasta', value: '2026-10-31' },
      { label: 'Categoría actual', value: 'Granos' },
      { label: 'Precio mínimo', value: '500.00' },
      { label: 'Precio máximo', value: '1500.50' },
    ]);
    expect(report.rows).toEqual([]);
    expect(total(report, 'Total vendido (neto)')).toBe('0.00');
    expect(report.emptyMessage).toBe('No hay ventas que coincidan con los filtros seleccionados.');
  });

  it('marca los filtros que no se usaron, para que la pantalla muestre solo los elegidos', async () => {
    const { service } = build();

    const report = await service.sales(PERIOD);

    expect(report.filters.filter((entry) => entry.isDefault).map((entry) => entry.label)).toEqual([
      'Categoría actual',
      'Precio mínimo',
      'Precio máximo',
    ]);
    expect(report.totals.find((entry) => entry.primary)?.label).toBe('Total vendido (neto)');
  });

  it('rechaza una categoría que no existe en el negocio', async () => {
    const { service } = build({ categoryName: null });

    await expect(
      service.sales({ ...PERIOD, categoryId: '0c000000-0000-4000-8000-000000000009' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('advierte que la categoría es la actual del producto', async () => {
    const { service } = build();

    const report = await service.sales(PERIOD);

    expect(report.notices.join(' ')).toContain('categoría que el producto tiene hoy');
  });
});

describe('HU-29 — reporte de ganancias', () => {
  const sales = [
    sale({
      id: 's1',
      number: 1,
      at: '2026-10-10T18:00:00Z',
      total: '4269.00',
      items: [
        line({ code: 'A1', quantity: 3, price: '900.00', cost: '700.00', returned: [1] }),
        line({ code: 'B1', quantity: 2, price: '1234.50', cost: '999.05' }),
      ],
    }),
    // Fiado sin ningún abono: pendiente.
    sale({
      id: 's3',
      number: 3,
      at: '2026-10-11T18:00:00Z',
      payment: 'CREDIT',
      customerId: 'c1',
      total: '1000.00',
      items: [line({ code: 'F1', quantity: 1, price: '1000.00', cost: '400.00' })],
    }),
    // Fiado cubierto por un abono ligado a la venta y al cliente: cobrado.
    sale({
      id: 's4',
      number: 4,
      at: '2026-10-12T18:00:00Z',
      payment: 'CREDIT',
      customerId: 'c1',
      total: '500.00',
      payments: [{ customerId: 'c1', amount: '500.00' }],
      items: [line({ code: 'E1', quantity: 1, price: '500.00', cost: '300.00' })],
    }),
    // Abono parcial: no se sabe qué productos cubrió.
    sale({
      id: 's5',
      number: 5,
      at: '2026-10-13T18:00:00Z',
      payment: 'CREDIT',
      customerId: 'c1',
      total: '400.00',
      payments: [{ customerId: 'c1', amount: '150.00' }],
      items: [line({ code: 'G1', quantity: 1, price: '400.00', cost: '100.00' })],
    }),
    // Abono ligado, pero de OTRO cliente: no vale.
    sale({
      id: 's6',
      number: 6,
      at: '2026-10-14T18:00:00Z',
      payment: 'CREDIT',
      customerId: 'c2',
      total: '300.00',
      payments: [{ customerId: 'c9', amount: '300.00' }],
      items: [line({ code: 'H1', quantity: 1, price: '300.00', cost: '100.00' })],
    }),
  ];

  it('calcula (precio histórico − costo histórico) × unidades netas e incluye solo lo cobrado', async () => {
    const { service } = build({ sales });

    const report = await service.profits(PERIOD);

    // #1: A1 2×(900−700)=400 + B1 2×(1234.50−999.05)=470.90 → 870.90. #4: 500−300=200.
    expect(total(report, 'Ingresos considerados')).toBe('4769.00');
    expect(total(report, 'Costos correspondientes')).toBe('3698.10');
    expect(total(report, 'Ganancia bruta')).toBe('1070.90');
    expect(total(report, 'Ventas consideradas')).toBe(2);
    expect(report.rows.map((row) => row['sale'])).toEqual(['#1', '#1', '#4']);
  });

  it('excluye los fiados sin cobro atribuible y los informa', async () => {
    const { service } = build({ sales });

    const report = await service.profits(PERIOD);

    // #3 (sin abonos), #5 (abono parcial) y #6 (abono de otro cliente).
    expect(total(report, 'Fiados excluidos (pendientes)')).toBe(3);
    expect(total(report, 'Monto de fiados excluidos')).toBe('1700.00');
    expect(report.notices.join(' ')).toContain('HU-19');
    expect(report.notices.join(' ')).toContain('costo desconocido');
  });

  it('un costo igual a cero se toma como válido (el modelo no distingue costo desconocido)', async () => {
    const { service } = build({
      sales: [
        sale({
          id: 's1',
          number: 1,
          at: '2026-10-10T18:00:00Z',
          total: '100.00',
          items: [line({ code: 'Z1', name: 'Bolsa', quantity: 1, price: '100.00', cost: '0.00' })],
        }),
      ],
    });

    const report = await service.profits(PERIOD);

    expect(total(report, 'Ganancia bruta')).toBe('100.00');
    // …pero advierte, nombrando el producto, que esa ganancia no es exacta.
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toContain('Z1 · Bolsa');
    expect(report.warnings[0]).toContain('sin costo registrado');
  });

  it('sin productos de costo cero no muestra ningún aviso', async () => {
    const { service } = build({ sales });

    const report = await service.profits(PERIOD);

    expect(report.warnings).toEqual([]);
    expect(report.help.length).toBeGreaterThan(0);
  });

  it('usa los valores históricos aunque el producto ya valga otra cosa', async () => {
    const { service } = build({
      sales: [
        sale({
          id: 's1',
          number: 1,
          at: '2026-10-10T18:00:00Z',
          total: '300.00',
          items: [line({ code: 'P1', quantity: 2, price: '150.00', cost: '90.00' })],
        }),
      ],
    });

    const report = await service.profits(PERIOD);

    expect(report.rows[0]).toMatchObject({ price: '150.00', unitCost: '90.00', profit: '120.00' });
  });

  it('una venta devuelta por completo no deja ganancia', async () => {
    const { service } = build({
      sales: [
        sale({
          id: 's1',
          number: 1,
          at: '2026-10-10T18:00:00Z',
          total: '0.00',
          items: [
            line({ code: 'R1', quantity: 2, price: '700.00', cost: '500.00', returned: [2] }),
          ],
        }),
      ],
    });

    const report = await service.profits(PERIOD);

    expect(report.rows).toEqual([]);
    expect(total(report, 'Ganancia bruta')).toBe('0.00');
    expect(report.emptyMessage).toBe(
      'No hay ventas cobradas verificables en el período seleccionado.',
    );
  });
});

describe('HU-30 A — productos más vendidos', () => {
  const sales = [
    sale({
      id: 's1',
      number: 1,
      at: '2026-10-10T18:00:00Z',
      total: '0.00',
      items: [
        line({
          code: 'A1',
          name: 'Arroz',
          category: 'Granos',
          quantity: 3,
          price: '900.00',
          cost: '700.00',
          returned: [1],
        }),
        line({ code: 'C1', quantity: 2, price: '100.00', cost: '50.00' }),
        line({ code: 'B1', quantity: 2, price: '100.00', cost: '50.00' }),
      ],
    }),
    sale({
      id: 's2',
      number: 2,
      at: '2026-10-11T18:00:00Z',
      payment: 'CREDIT',
      customerId: 'c1',
      total: '0.00',
      items: [
        line({
          code: 'A1',
          name: 'Arroz',
          category: 'Granos',
          quantity: 2,
          price: '950.00',
          cost: '700.00',
        }),
        // Producto desactivado: igual aparece si vendió.
        line({ code: 'Z1', name: 'Descontinuado', quantity: 2, price: '100.00', cost: '50.00' }),
        // Devuelto por completo: fuera del ranking.
        line({ code: 'D1', quantity: 5, price: '100.00', cost: '50.00', returned: [5] }),
      ],
    }),
  ];

  it('ordena por unidades netas y desempata por código, sin contar lo devuelto', async () => {
    const { service } = build({ sales });

    const report = await service.topProducts(PERIOD);

    expect(report.rows.map((row) => [row['position'], row['code'], row['units']])).toEqual([
      [1, 'A1', 4],
      [2, 'B1', 2],
      [3, 'C1', 2],
      [4, 'Z1', 2],
    ]);
    // A1: 2 netas a 900 + 2 a 950 = 3700.
    expect(report.rows[0]).toMatchObject({
      product: 'Arroz',
      category: 'Granos',
      amount: '3700.00',
    });
    expect(total(report, 'Unidades netas')).toBe(10);
    expect(total(report, 'Productos distintos')).toBe(4);
  });

  it('informa cuando no hubo ventas', async () => {
    const { service } = build();

    const report = await service.topProducts(PERIOD);

    expect(report.rows).toEqual([]);
    expect(report.emptyMessage).toBe('No hay productos vendidos en el período seleccionado.');
  });
});

describe('HU-30 B — deudas de clientes', () => {
  function withDebts(customers: FakeReportsRepository['debtsData']['customers']) {
    const repository = new FakeReportsRepository();

    repository.debtsData = { businessName: 'Negocio de prueba', customers };

    return { repository, service: new ReportsService(repository as never) };
  }

  const fiado = (id: string, number: number, at: string, amount: string) => ({
    id,
    number,
    createdAt: new Date(at),
    total: decimal(amount),
  });
  const payment = (amount: string, saleId: string | null = null) => ({
    amount: decimal(amount),
    saleId,
  });

  it('muestra cada fiado pendiente con su saldo acumulado y cuadra con el saldo del cliente', async () => {
    const { service } = withDebts([
      {
        id: 'c1',
        name: 'Ana',
        sales: [
          fiado('v1', 1, '2026-10-01T18:00:00Z', '1000.00'),
          // Era de 800 y se devolvieron 300: Sale.total ya refleja 500.
          fiado('v2', 2, '2026-10-05T18:00:00Z', '500.00'),
        ],
        // 400 ligados al primer fiado y 100 generales.
        creditPayments: [payment('400.00', 'v1'), payment('100.00')],
      },
      // Anulado: su total es 0.
      {
        id: 'c2',
        name: 'Beto',
        sales: [fiado('v3', 3, '2026-10-02T18:00:00Z', '0.00')],
        creditPayments: [],
      },
      // Pagó todo con un abono general.
      {
        id: 'c3',
        name: 'Carla',
        sales: [fiado('v4', 4, '2026-10-03T18:00:00Z', '300.00')],
        creditPayments: [payment('300.00')],
      },
      {
        id: 'c4',
        name: 'Dani',
        sales: [fiado('v5', 5, '2026-10-04T18:00:00Z', '250.00')],
        creditPayments: [],
      },
    ]);

    const report = await service.customerDebts();

    expect(
      report.rows.map((row) => [row['customer'], row['sale'], row['pending'], row['balance']]),
    ).toEqual([
      ['Ana', '#1', '600.00', '600.00'],
      ['Ana', '#2', '500.00', '1100.00'],
      // El abono general no se reparte entre fiados: se descuenta aparte.
      ['Ana', 'Abonos sin venta asignada', '-100.00', '1000.00'],
      ['Dani', '#5', '250.00', '250.00'],
    ]);
    expect(report.rows[0]).toMatchObject({
      date: '2026-10-01 12:00',
      amount: '1000.00',
      paid: '400.00',
    });
    expect(total(report, 'Total general de deudas')).toBe('1250.00');
    expect(total(report, 'Clientes con deuda')).toBe(2);
  });

  it('sin deudas devuelve el mensaje y total cero', async () => {
    const { service } = withDebts([{ id: 'c1', name: 'Ana', sales: [], creditPayments: [] }]);

    const report = await service.customerDebts();

    expect(report.rows).toEqual([]);
    expect(report.emptyMessage).toBe('No hay clientes con deudas pendientes.');
    expect(total(report, 'Total general de deudas')).toBe('0.00');
  });

  it('refleja los datos vigentes en cada consulta (no guarda saldos)', async () => {
    const { service, repository } = withDebts([]);

    expect((await service.customerDebts()).rows).toHaveLength(0);

    repository.debtsData.customers.push({
      id: 'c1',
      name: 'Ana',
      sales: [fiado('v1', 1, '2026-10-01T18:00:00Z', '100.00')],
      creditPayments: [],
    });

    expect((await service.customerDebts()).rows).toHaveLength(1);
    expect(repository.debtsCalls).toBe(2);
  });

  it('un fiado cuyo abono ligado supera su total no deja pendiente negativo', async () => {
    // Pagó 100 y luego se devolvieron 30: el fiado vale 70 y hay 30 a favor.
    const { service } = withDebts([
      {
        id: 'c1',
        name: 'Ana',
        sales: [
          fiado('v1', 1, '2026-10-01T18:00:00Z', '70.00'),
          fiado('v2', 2, '2026-10-02T18:00:00Z', '200.00'),
        ],
        creditPayments: [payment('100.00', 'v1')],
      },
    ]);

    const report = await service.customerDebts();

    // Saldo real: 270 − 100 = 170. El fiado #1 no debe nada y su exceso baja el saldo.
    expect(report.rows.map((row) => [row['sale'], row['pending'], row['balance']])).toEqual([
      ['#2', '200.00', '200.00'],
      ['Abonos sin venta asignada', '-30.00', '170.00'],
    ]);
    expect(total(report, 'Total general de deudas')).toBe('170.00');
  });
});
