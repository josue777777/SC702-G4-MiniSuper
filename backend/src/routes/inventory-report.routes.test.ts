import ExcelJS from 'exceljs';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../middleware/error-handler.middleware.js';
import { fakeSession } from '../testing/fake-session.js';
import { FakeInventoryRepository } from '../testing/inventory.repository.fake.js';
import {
  buildProduct,
  CATEGORY_ID,
  FakeProductsRepository,
  OTHER_PRODUCT_ID,
  PRODUCT_ID,
} from '../testing/products.repository.fake.js';
import { createInventoryReportRouter } from './inventory-report.routes.js';

/**
 * Excel del reporte de inventario (HU-25 / HU-40): los mismos filtros, columnas
 * y secciones que se eligen en Reportes › Inventario.
 */

const OTHER_CATEGORY = '22222222-2222-4222-8222-999999999999';

function buildApp() {
  const products = new FakeProductsRepository({
    products: [
      buildProduct({ id: PRODUCT_ID, code: 'P001', name: 'Café', stock: 2, minStock: 5 }),
      buildProduct({
        id: OTHER_PRODUCT_ID,
        code: 'P002',
        name: '=Arroz',
        categoryId: OTHER_CATEGORY,
        categoryName: 'Granos',
        cost: '500.00',
        stock: 20,
      }),
      buildProduct({ id: '11111111-1111-4111-8111-1111111111aa', name: 'Viejo', isActive: false }),
    ],
  });
  const inventory = new FakeInventoryRepository([
    {
      id: PRODUCT_ID,
      code: 'P001',
      name: 'Café',
      stock: 2,
      minStock: 5,
      expirationDate: '2026-10-01',
    },
    { id: OTHER_PRODUCT_ID, code: 'P002', name: '=Arroz', stock: 20 },
  ]);
  const app = express();

  app.use(
    '/api/reports/inventory',
    fakeSession(),
    createInventoryReportRouter(
      () => products,
      () => inventory,
      () => '2026-11-04',
    ),
  );
  app.use(errorHandler);

  return app;
}

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

async function sheets(content: Buffer) {
  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(content as unknown as ArrayBuffer);

  const read = (name: string) => {
    const rows: unknown[][] = [];

    workbook.getWorksheet(name)?.eachRow((row) => {
      rows.push((row.values as unknown[]).slice(1));
    });

    return rows;
  };

  return { names: workbook.worksheets.map((sheet) => sheet.name), read };
}

describe('GET /api/reports/inventory/export (HU-25, HU-40)', () => {
  it('exporta solo productos activos, con las columnas y el orden elegidos', async () => {
    const file = await download(
      buildApp(),
      '/api/reports/inventory/export?columns=code,name,stock,value&sort=stockAsc',
    );

    expect(file.status).toBe(200);
    expect(file.headers['content-disposition']).toBe(
      'attachment; filename="reporte-inventario.xlsx"',
    );

    const { names, read } = await sheets(file.body as Buffer);
    const rows = read('Productos');

    expect(names).toEqual(['Resumen', 'Productos']);
    expect(rows[0]).toEqual(['Código', 'Producto', 'Stock', 'Valor en inventario']);
    // Stock de menor a mayor; el desactivado no aparece; el texto con «=» queda inerte.
    expect(rows[1]).toEqual(['P001', 'Café', 2, 2000]);
    expect(rows[2]).toEqual(['P002', "'=Arroz", 20, 10000]);
    expect(rows.some((row) => row.includes('Viejo'))).toBe(false);
    expect(read('Resumen').find((row) => row[0] === 'Valor al costo')?.[1]).toBe(12000);
  });

  it('respeta la categoría y agrega una hoja por sección: vencimientos y stock bajo', async () => {
    const file = await download(
      buildApp(),
      `/api/reports/inventory/export?categoryId=${CATEGORY_ID}&sections=products,expirations,lowStock`,
    );
    const { names, read } = await sheets(file.body as Buffer);

    expect(names).toEqual(['Resumen', 'Productos', 'Vencimientos', 'Stock bajo']);
    expect(read('Productos').slice(1, 2)[0]?.[1]).toBe('Café');
    // Una fila por lote (HU-32): el lote y sus unidades.
    expect(read('Vencimientos')[1]).toEqual([
      'P001',
      'Café',
      2,
      'SIN LOTE',
      2,
      '2026-10-01',
      'Vencido hace 34 día(s)',
    ]);
    expect(read('Stock bajo')[1]).toEqual(['P001', 'Café', 2, 5]);
    expect(read('Resumen').find((row) => row[0] === 'Categoría')?.[1]).toBe('Bebidas');
  });

  it('el nombre del producto siempre va, aunque no se pida', async () => {
    const file = await download(buildApp(), '/api/reports/inventory/export?columns=code');

    expect((await sheets(file.body as Buffer)).read('Productos')[0]).toEqual([
      'Código',
      'Producto',
    ]);
  });

  it('rechaza filtros desconocidos o inválidos', async () => {
    const app = buildApp();

    for (const query of [
      'columns=code,profit',
      'sort=random',
      'sections=',
      'categoryId=x',
      'extra=1',
    ]) {
      expect((await request(app).get(`/api/reports/inventory/export?${query}`)).status).toBe(400);
    }
  });
});

describe('GET /api/reports/inventory (resumen, sin filas)', () => {
  it('trae totales, gráficos y cuántas filas tiene cada sección, pero no las filas', async () => {
    const response = await request(buildApp())
      .get('/api/reports/inventory?sections=products,expirations,lowStock')
      .expect(200);
    const summary = response.body.data;

    expect(response.headers['cache-control']).toBe('no-store');
    expect(summary).not.toHaveProperty('products');
    expect(summary).toMatchObject({
      scope: 'Todas',
      // Solo activos: Café (2 × ₡1.000) y Arroz (20 × ₡500).
      totals: { count: 2, units: 22, value: '12000.00' },
      counts: { products: 2, expirations: 1, lowStock: 1 },
    });
    expect(summary.charts.map((chart: { id: string }) => chart.id)).toEqual([
      'inventory-value',
      'inventory-status',
    ]);
    expect(summary.charts[0].data).toEqual([
      { key: 'Granos', label: 'Granos', value: 10000 },
      { key: 'Bebidas', label: 'Bebidas', value: 2000 },
    ]);
  });

  it('una sección que no se eligió no se cuenta, y la categoría limita todo', async () => {
    const all = await request(buildApp()).get('/api/reports/inventory').expect(200);
    const granos = await request(buildApp())
      .get(`/api/reports/inventory?categoryId=${OTHER_CATEGORY}&sections=products,lowStock`)
      .expect(200);

    expect(all.body.data.counts).toEqual({ products: 2, expirations: null, lowStock: null });
    expect(granos.body.data).toMatchObject({
      scope: 'Granos',
      totals: { count: 1, units: 20, value: '10000.00' },
      counts: { products: 1, expirations: null, lowStock: 0 },
    });
  });
});

describe('GET /api/reports/inventory/rows (una página de una sección)', () => {
  it('entrega una página de productos en el orden elegido', async () => {
    const app = buildApp();
    const first = await request(app)
      .get('/api/reports/inventory/rows?section=products&sort=name&pageSize=1')
      .expect(200);
    const second = await request(app)
      .get('/api/reports/inventory/rows?section=products&sort=name&pageSize=1&page=2')
      .expect(200);

    expect(first.body.data).toMatchObject({ page: 1, pageSize: 1, total: 2, pageCount: 2 });
    expect(first.body.data.rows.map((row: { name: string }) => row.name)).toEqual(['=Arroz']);
    expect(second.body.data.rows.map((row: { name: string }) => row.name)).toEqual(['Café']);
  });

  it('cada sección tiene sus filas y respeta la categoría', async () => {
    const app = buildApp();
    const get = async (query: string) =>
      (await request(app).get(`/api/reports/inventory/rows?${query}`).expect(200)).body.data;

    expect(
      (await get('section=lowStock')).rows.map((row: { productCode: string }) => row.productCode),
    ).toEqual(['P001']);
    expect((await get('section=expirations')).rows).toHaveLength(1);
    expect((await get('section=expirations&expirations=EXPIRING_SOON')).rows).toHaveLength(0);
    expect((await get(`section=lowStock&categoryId=${OTHER_CATEGORY}`)).total).toBe(0);
    expect((await get('section=products&all=true')).rows).toHaveLength(2);
  });

  it('rechaza una sección o una página inválidas y filtros desconocidos', async () => {
    const app = buildApp();

    for (const query of [
      '',
      'section=otra',
      'section=products&page=0',
      'section=products&pageSize=101',
      'section=products&all=true&page=1',
      'section=products&businessId=x',
    ]) {
      const response = await request(app).get(`/api/reports/inventory/rows?${query}`);

      expect(response.status, query).toBe(400);
    }
  });
});
