import express from 'express';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../middleware/error-handler.middleware.js';
import {
  buildProduct,
  CATEGORY_ID,
  FakeProductsRepository,
  OTHER_PRODUCT_ID,
  PRODUCT_ID,
} from '../testing/products.repository.fake.js';
import { sanitizeCell } from '../utils/catalog-xlsx.js';
import { todayInBusinessZone } from '../utils/dates.js';
import { createProductsRouter } from './products.routes.js';

/** Exportación del catálogo a Excel (HU-33): ruta real, repositorio falso, archivo leído de vuelta. */

const OTHER_CATEGORY_ID = '22222222-9999-4999-8999-999999999999';

function buildApp(repository: FakeProductsRepository) {
  const app = express();
  app.use(express.json());
  app.use('/api/products', createProductsRouter(repository));
  app.use(errorHandler);

  return app;
}

async function download(app: express.Express, query = '') {
  const response = await request(app)
    .get(`/api/products/export${query}`)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });

  return response;
}

async function readRows(body: Buffer): Promise<(string | number | null)[][]> {
  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(body as unknown as ArrayBuffer);

  const rows: (string | number | null)[][] = [];

  workbook.worksheets[0]?.eachRow((row) => {
    rows.push((row.values as (string | number | null)[]).slice(1));
  });

  return rows;
}

describe('GET /api/products/export', () => {
  it('descarga un .xlsx válido con las columnas y solo los productos activos', async () => {
    const app = buildApp(
      new FakeProductsRepository({
        products: [
          buildProduct(),
          buildProduct({
            id: OTHER_PRODUCT_ID,
            code: 'P002',
            name: 'Arroz 1 kg',
            categoryId: OTHER_CATEGORY_ID,
            categoryName: 'Granos',
            price: '1234.50',
            cost: '999.05',
            stock: 7,
            preferredSupplierName: null,
          }),
          buildProduct({
            id: '11111111-3333-4333-8333-333333333333',
            code: 'P003',
            isActive: false,
          }),
        ],
      }),
    );

    const response = await download(app);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="catalogo-productos-${todayInBusinessZone()}.xlsx"`,
    );

    const rows = await readRows(response.body as Buffer);

    expect(rows[0]).toEqual([
      'Código',
      'Nombre',
      'Categoría',
      'Precio',
      'Costo',
      'Stock',
      'Proveedor',
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual([
      'P001',
      'Café molido 500 g',
      'Bebidas',
      1500,
      1000,
      10,
      'Distribuidora Central',
    ]);
    // Precisión: 1234.50 y 999.05 se conservan exactos; sin proveedor la celda queda vacía.
    expect(rows[2]?.slice(0, 6)).toEqual(['P002', 'Arroz 1 kg', 'Granos', 1234.5, 999.05, 7]);
  });

  it('exporta todo el catálogo, sin recortarlo a una página', async () => {
    const products = Array.from({ length: 250 }, (_, index) =>
      buildProduct({
        id: `11111111-0000-4000-8000-${String(index).padStart(12, '0')}`,
        code: `C${index}`,
      }),
    );

    const rows = await readRows(
      (await download(buildApp(new FakeProductsRepository({ products })))).body as Buffer,
    );

    expect(rows).toHaveLength(251);
  });

  it('filtra por categoría', async () => {
    const app = buildApp(
      new FakeProductsRepository({
        products: [
          buildProduct(),
          buildProduct({
            id: OTHER_PRODUCT_ID,
            code: 'P002',
            categoryId: OTHER_CATEGORY_ID,
            categoryName: 'Granos',
          }),
        ],
      }),
    );

    const rows = await readRows(
      (await download(app, `?categoryId=${OTHER_CATEGORY_ID}`)).body as Buffer,
    );

    expect(rows.map((row) => row[0])).toEqual(['Código', 'P002']);
  });

  it('responde 404 con mensaje claro si no hay productos activos, sin archivo', async () => {
    const empty = buildApp(new FakeProductsRepository({ products: [] }));
    const onlyInactive = buildApp(
      new FakeProductsRepository({ products: [buildProduct({ id: PRODUCT_ID, isActive: false })] }),
    );

    for (const app of [empty, onlyInactive]) {
      const response = await request(app).get('/api/products/export');

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('No hay productos activos para exportar.');
    }

    const byCategory = await request(buildApp(new FakeProductsRepository())).get(
      `/api/products/export?categoryId=${OTHER_CATEGORY_ID}`,
    );

    expect(byCategory.status).toBe(404);
    expect(byCategory.body.error.message).toContain('en esa categoría');
  });

  it('responde 400 si la categoría no es un identificador válido', async () => {
    const response = await request(buildApp(new FakeProductsRepository())).get(
      '/api/products/export?categoryId=no-es-uuid',
    );

    expect(response.status).toBe(400);
  });

  it('neutraliza fórmulas en los textos exportados', async () => {
    const app = buildApp(
      new FakeProductsRepository({
        products: [
          buildProduct({
            code: '=1+1',
            name: '@SUM(A1)',
            categoryId: CATEGORY_ID,
            categoryName: '-cmd|calc',
            preferredSupplierName: '+evil',
          }),
        ],
      }),
    );

    const rows = await readRows((await download(app)).body as Buffer);

    expect(rows[1]).toEqual(["'=1+1", "'@SUM(A1)", "'-cmd|calc", 1500, 1000, 10, "'+evil"]);
  });
});

describe('sanitizeCell', () => {
  it('solo antepone el apóstrofo a los textos que parecen fórmulas', () => {
    expect(sanitizeCell('=A1')).toBe("'=A1");
    expect(sanitizeCell('Arroz')).toBe('Arroz');
    expect(sanitizeCell('')).toBe('');
  });
});
