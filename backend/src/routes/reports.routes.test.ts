import express from 'express';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Role } from '../auth/permissions.js';
import { errorHandler } from '../middleware/error-handler.middleware.js';
import { requirePermission } from '../middleware/require-auth.middleware.js';
import { fakeSession, TEST_BUSINESS_ID } from '../testing/fake-session.js';
import { FakeReportsRepository, line, sale } from '../testing/reports.repository.fake.js';
import { createReportsRouter } from './reports.routes.js';

/**
 * Reportes comerciales (HU-28, HU-29, HU-30): rutas reales con repositorio
 * falso, con el mismo permiso con que `routes/index.ts` las monta.
 */

const OTHER_BUSINESS_ID = '0b000000-0000-4000-8000-0000000000ff';
const PERIOD = 'from=2026-10-01&to=2026-10-31';

function buildApp(role: Role = 'ENCARGADO', businessId = TEST_BUSINESS_ID) {
  const repository = new FakeReportsRepository(businessId);
  const requestedBusinesses: string[] = [];
  const app = express();

  app.use(express.json());
  app.use(
    '/api/reports/commercial',
    fakeSession(businessId, role),
    requirePermission('reports.sales'),
    createReportsRouter((id) => {
      requestedBusinesses.push(id);

      return repository as never;
    }),
  );
  app.use(errorHandler);

  return { app, repository, requestedBusinesses };
}

function withSale(repository: FakeReportsRepository) {
  repository.salesData.sales.push(
    sale({
      id: 's1',
      number: 1,
      at: '2026-10-10T18:00:00Z',
      total: '2469.00',
      items: [
        line({
          code: 'B1',
          name: 'Café',
          category: 'Bebidas',
          quantity: 2,
          price: '1234.50',
          cost: '999.05',
        }),
        line({
          code: 'F1',
          name: '=HYPERLINK("http://malo.example")',
          quantity: 1,
          price: '10.00',
          cost: '5.00',
        }),
      ],
    }),
  );
}

describe('permisos y aislamiento por negocio', () => {
  it.each(['CAJERO', 'BODEGA', 'ADMIN'] as const)(
    'el rol %s no accede a los reportes',
    async (role) => {
      const { app } = buildApp(role);

      for (const path of ['sales', 'profits', 'top-products', 'customer-debts', 'options']) {
        const response = await request(app).get(`/api/reports/commercial/${path}?${PERIOD}`);

        expect(response.status, `${role} ${path}`).toBe(403);
      }

      expect(
        (await request(app).get(`/api/reports/commercial/sales/export?${PERIOD}`)).status,
      ).toBe(403);
    },
  );

  it('el Encargado accede a los cuatro reportes', async () => {
    const { app } = buildApp('ENCARGADO');

    for (const path of ['sales', 'profits', 'top-products']) {
      expect((await request(app).get(`/api/reports/commercial/${path}?${PERIOD}`)).status).toBe(
        200,
      );
    }

    expect((await request(app).get('/api/reports/commercial/customer-debts')).status).toBe(200);
  });

  it('consulta SIEMPRE el negocio de la sesión y rechaza uno enviado por la petición', async () => {
    const { app, repository, requestedBusinesses } = buildApp('ENCARGADO', TEST_BUSINESS_ID);

    withSale(repository);
    await request(app).get(`/api/reports/commercial/sales?${PERIOD}`).expect(200);

    const forged = await request(app).get(
      `/api/reports/commercial/sales?${PERIOD}&businessId=${OTHER_BUSINESS_ID}`,
    );
    const forgedDebts = await request(app).get(
      `/api/reports/commercial/customer-debts?businessId=${OTHER_BUSINESS_ID}`,
    );

    expect(forged.status).toBe(400);
    expect(forgedDebts.status).toBe(400);
    expect(new Set(requestedBusinesses)).toEqual(new Set([TEST_BUSINESS_ID]));
  });
});

describe('GET /api/reports/commercial/:kind', () => {
  it('responde el reporte sin guardarlo en caché', async () => {
    const { app, repository } = buildApp();

    withSale(repository);

    const response = await request(app).get(`/api/reports/commercial/sales?${PERIOD}`);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toMatchObject({
      kind: 'sales',
      title: 'Reporte de ventas',
      businessName: 'Negocio de prueba',
    });
    expect(response.body.data.totals[0]).toMatchObject({
      label: 'Total vendido (neto)',
      value: '2479.00',
    });
    // El resumen no lleva las filas: solo cuántas son y los gráficos ya calculados.
    expect(response.body.data.rows).toBeUndefined();
    expect(response.body.data.rowCount).toBe(2);
    expect(response.body.data.charts.map((chart: { id: string }) => chart.id)).toEqual([
      'sales-by-day',
      'sales-by-category',
    ]);
  });

  it('pasa los filtros combinados al repositorio', async () => {
    const { app, repository } = buildApp();
    const category = '0c000000-0000-4000-8000-000000000001';

    repository.salesData.categoryName = 'Bebidas';

    await request(app)
      .get(
        `/api/reports/commercial/sales?${PERIOD}&categoryId=${category}&minPrice=100&maxPrice=2000`,
      )
      .expect(200);

    expect(repository.salesCalls[0]?.filter).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
      categoryId: category,
      minPrice: '100',
      maxPrice: '2000',
    });
  });

  it.each([
    ['sin fechas', 'sales', ''],
    ['fecha final anterior', 'sales', 'from=2026-10-05&to=2026-10-01'],
    ['período de más de un año', 'profits', 'from=2025-01-01&to=2026-12-31'],
    ['precio negativo', 'sales', `${PERIOD}&minPrice=-5`],
    ['precios cruzados', 'sales', `${PERIOD}&minPrice=900&maxPrice=100`],
    ['categoría inválida', 'sales', `${PERIOD}&categoryId=granos`],
    ['filtro de precio en ganancias', 'profits', `${PERIOD}&minPrice=1`],
  ])('responde 400 con %s', async (_name, kind, query) => {
    const { app } = buildApp();

    const response = await request(app).get(`/api/reports/commercial/${kind}?${query}`);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('Los datos enviados no son válidos.');
  });

  it('responde 400 con un tipo de reporte desconocido y 404 con una categoría ajena', async () => {
    const { app } = buildApp();

    expect((await request(app).get(`/api/reports/commercial/inventory?${PERIOD}`)).status).toBe(
      400,
    );
    expect(
      (
        await request(app).get(
          `/api/reports/commercial/sales?${PERIOD}&categoryId=0c000000-0000-4000-8000-000000000009`,
        )
      ).status,
    ).toBe(404);
  });

  it('lista las categorías del negocio para el filtro', async () => {
    const { app, repository } = buildApp();

    repository.categories = [{ id: 'c1', name: 'Bebidas' }];

    const response = await request(app).get('/api/reports/commercial/options');

    expect(response.body).toEqual({ data: { categories: [{ id: 'c1', name: 'Bebidas' }] } });
  });
});

/** `count` ventas de una línea cada una, en días distintos de octubre. */
function withManySales(repository: FakeReportsRepository, count: number) {
  for (let index = 1; index <= count; index += 1) {
    repository.salesData.sales.push(
      sale({
        id: `s${index}`,
        number: index,
        at: `2026-10-${String(((index - 1) % 28) + 1).padStart(2, '0')}T18:00:00Z`,
        total: `${index}.00`,
        items: [
          line({
            code: `P${String(index).padStart(3, '0')}`,
            quantity: 1,
            price: `${index}.00`,
            cost: '0.50',
          }),
        ],
      }),
    );
  }
}

describe('GET /api/reports/commercial/:kind/rows', () => {
  const ROWS = `/api/reports/commercial/sales/rows?${PERIOD}`;

  it('entrega el detalle de a una página y dice cuántas filas y páginas hay', async () => {
    const { app, repository } = buildApp();

    withManySales(repository, 45);

    const first = await request(app).get(ROWS).expect(200);
    const last = await request(app).get(`${ROWS}&page=3`).expect(200);

    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.body.data).toMatchObject({ page: 1, pageSize: 20, total: 45, pageCount: 3 });
    expect(first.body.data.rows).toHaveLength(20);
    expect(last.body.data).toMatchObject({ page: 3, total: 45, pageCount: 3 });
    expect(last.body.data.rows).toHaveLength(5);
  });

  it('las páginas, juntas, son exactamente el detalle completo: sin repetir ni omitir', async () => {
    const { app, repository } = buildApp();

    withManySales(repository, 45);

    const all = (await request(app).get(`${ROWS}&all=true`).expect(200)).body.data;
    const pages = [];

    for (const page of [1, 2, 3]) {
      pages.push(...(await request(app).get(`${ROWS}&page=${page}`)).body.data.rows);
    }

    expect(all).toMatchObject({ page: 1, total: 45, pageCount: 1 });
    expect(pages).toEqual(all.rows);
    expect(new Set(pages.map((row: { code: string }) => row.code)).size).toBe(45);
  });

  it('una página que ya no existe devuelve la última, y sin filas responde vacío', async () => {
    const { app, repository } = buildApp();

    expect((await request(app).get(ROWS).expect(200)).body.data).toEqual({
      rows: [],
      page: 1,
      pageSize: 20,
      total: 0,
      pageCount: 1,
    });

    withManySales(repository, 21);

    expect((await request(app).get(`${ROWS}&page=99`).expect(200)).body.data).toMatchObject({
      page: 2,
      pageCount: 2,
    });
  });

  it('acepta otro tamaño de página hasta 100 y rechaza valores inválidos', async () => {
    const { app, repository } = buildApp();

    withManySales(repository, 45);

    expect(
      (await request(app).get(`${ROWS}&pageSize=100`).expect(200)).body.data.rows,
    ).toHaveLength(45);

    for (const query of [
      'page=0',
      'page=-1',
      'page=abc',
      'page=1.5',
      'pageSize=101',
      'pageSize=0',
      'all=yes',
      'all=true&page=2',
      'page=1&page=2',
    ]) {
      const response = await request(app).get(`${ROWS}&${query}`);

      expect(response.status, query).toBe(400);
    }
  });

  it('valida los filtros del reporte igual que el resumen', async () => {
    const { app } = buildApp();

    expect(
      (await request(app).get('/api/reports/commercial/sales/rows?from=2026-10-31&to=2026-10-01'))
        .status,
    ).toBe(400);
    expect((await request(app).get(`${ROWS}&otro=1`)).status).toBe(400);
    expect(
      (await request(app).get('/api/reports/commercial/customer-debts/rows?page=1')).status,
    ).toBe(200);
    expect(
      (await request(app).get(`/api/reports/commercial/customer-debts/rows?${PERIOD}`)).status,
    ).toBe(400);
  });

  it('exige el mismo permiso y el negocio de la sesión', async () => {
    for (const role of ['CAJERO', 'BODEGA', 'ADMIN'] as const) {
      expect((await request(buildApp(role).app).get(ROWS)).status, role).toBe(403);
    }

    const { app, requestedBusinesses } = buildApp('ENCARGADO', TEST_BUSINESS_ID);

    expect((await request(app).get(`${ROWS}&businessId=${OTHER_BUSINESS_ID}`)).status).toBe(400);
    await request(app).get(ROWS).expect(200);
    expect(new Set(requestedBusinesses)).toEqual(new Set([TEST_BUSINESS_ID]));
  });
});

describe('GET /api/reports/commercial/:kind/export', () => {
  async function download(app: express.Express, path: string) {
    return request(app)
      .get(path)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
  }

  async function rows(content: Buffer, sheetName: string) {
    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.load(content as unknown as ArrayBuffer);

    const values: (string | number | null)[][] = [];

    workbook.getWorksheet(sheetName)?.eachRow((row) => {
      values.push((row.values as (string | number | null)[]).slice(1));
    });

    return values;
  }

  it('entrega un .xlsx con los mismos filtros, totales y filas que la pantalla', async () => {
    const { app, repository } = buildApp();

    withSale(repository);

    const json = await request(app).get(`/api/reports/commercial/sales?${PERIOD}`);
    const file = await download(app, `/api/reports/commercial/sales/export?${PERIOD}`);

    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(file.headers['content-disposition']).toBe('attachment; filename="reporte-sales.xlsx"');
    expect(file.headers['cache-control']).toBe('no-store');

    const body = file.body as Buffer;

    expect(body.subarray(0, 2).toString('latin1')).toBe('PK');

    const data = await rows(body, 'Datos');
    const report = json.body.data;

    expect(data[0]).toEqual(report.columns.map((column: { label: string }) => column.label));
    expect(data).toHaveLength(report.rowCount + 1);

    // Importes numéricos exactos; el texto que parece fórmula queda inerte.
    const coffee = data.find((row) => row[2] === 'B1');

    expect(coffee?.[5]).toBe(1234.5);
    expect(coffee?.[11]).toBe(2469);
    expect(data.find((row) => row[2] === 'F1')?.[3]).toBe(`'=HYPERLINK("http://malo.example")`);

    const summary = await rows(body, 'Resumen');

    expect(summary.find((row) => row[0] === 'Desde')?.[1]).toBe('2026-10-01');
    expect(summary.find((row) => row[0] === 'Hasta')?.[1]).toBe('2026-10-31');
    expect(summary.find((row) => row[0] === 'Total vendido (neto)')?.[1]).toBe(2479);
    expect(summary.find((row) => row[0] === 'Transacciones')?.[1]).toBe(1);
  });

  it('exporta el estado vacío cuando no hay resultados', async () => {
    const { app } = buildApp();

    const file = await download(app, '/api/reports/commercial/customer-debts/export');
    const summary = await rows(file.body as Buffer, 'Resumen');

    expect(file.status).toBe(200);
    expect(summary.find((row) => row[0] === 'Resultado')?.[1]).toBe(
      'No hay clientes con deudas pendientes.',
    );
  });

  it('valida los filtros igual que la consulta en pantalla', async () => {
    const { app } = buildApp();

    expect((await request(app).get('/api/reports/commercial/sales/export')).status).toBe(400);
  });

  it('HU-40: exporta solo las columnas que el usuario dejó activas, en el orden del reporte', async () => {
    const { app, repository } = buildApp();

    withSale(repository);

    const file = await download(
      app,
      `/api/reports/commercial/sales/export?${PERIOD}&columns=net,product,sale`,
    );
    const data = await rows(file.body as Buffer, 'Datos');

    expect(file.status).toBe(200);
    expect(data[0]).toEqual(['Venta', 'Producto', 'Importe neto']);
    expect(data.find((row) => row[1] === 'Café')?.[2]).toBe(2469);
    // Los totales del resumen no cambian: describen el reporte entero.
    expect(
      (await rows(file.body as Buffer, 'Resumen')).find((row) => row[0] === 'Transacciones')?.[1],
    ).toBe(1);
  });

  it('HU-40: rechaza columnas que no existen en ese reporte o con formato inválido', async () => {
    const { app } = buildApp();
    const base = `/api/reports/commercial/sales/export?${PERIOD}`;

    const unknown = await request(app).get(`${base}&columns=sale,profit`);

    expect(unknown.status).toBe(400);
    expect(unknown.body.error.message).toContain('profit');
    expect((await request(app).get(`${base}&columns=`)).status).toBe(400);
    expect((await request(app).get(`${base}&columns=sale;drop`)).status).toBe(400);
  });
});
