import express from 'express';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Role } from '../auth/permissions.js';
import { errorHandler } from '../middleware/error-handler.middleware.js';
import { requirePermission } from '../middleware/require-auth.middleware.js';
import { PHYSICAL_COUNT_REASON } from '../services/inventory.service.js';
import { FakeBusinessRepository } from '../testing/business.repository.fake.js';
import { fakeSession, TEST_BUSINESS_ID } from '../testing/fake-session.js';
import { FakeInventoryRepository } from '../testing/inventory.repository.fake.js';
import { createCountsReportRouter } from './counts-report.routes.js';

/**
 * Reporte de conteos físicos (HU-10): rutas reales con dobles, montadas con el
 * mismo permiso que en `routes/index.ts`.
 */

const PERIOD = 'from=2026-10-01&to=2026-10-31';

function buildApp(role: Role = 'BODEGA') {
  const inventory = new FakeInventoryRepository([
    { id: 'p1', code: 'A1', name: 'Arroz 1 kg', stock: 18, category: 'Granos', cost: '980.00' },
    { id: 'p2', code: 'C1', name: 'Café 500 g', stock: 6, category: 'Bebidas', cost: '2500.00' },
  ]);
  const requested: string[] = [];
  const app = express();

  // Arroz: faltaban 2 (el 6 de octubre). Café: sobraba 1 (el 20). Uno de
  // noviembre y un ajuste que no es conteo quedan fuera.
  inventory.seedMovement(
    PHYSICAL_COUNT_REASON,
    count('p1', 'A1', 'Arroz 1 kg', 20, 18, '2026-10-06T15:00:00Z'),
  );
  inventory.seedMovement(
    PHYSICAL_COUNT_REASON,
    count('p2', 'C1', 'Café 500 g', 5, 6, '2026-10-20T15:00:00Z'),
  );
  inventory.seedMovement(
    PHYSICAL_COUNT_REASON,
    count('p2', 'C1', 'Café 500 g', 6, 4, '2026-11-02T15:00:00Z'),
  );
  inventory.seedMovement(
    'Ajuste manual',
    count('p1', 'A1', 'Arroz 1 kg', 18, 10, '2026-10-07T15:00:00Z'),
  );

  app.use(
    '/api/reports/counts',
    fakeSession(TEST_BUSINESS_ID, role),
    requirePermission('reports.inventory'),
    createCountsReportRouter(
      (id) => {
        requested.push(id);

        return inventory;
      },
      () => new FakeBusinessRepository(),
    ),
  );
  app.use(errorHandler);

  return { app, requested };
}

function count(
  productId: string,
  productCode: string,
  productName: string,
  systemStock: number,
  countedQuantity: number,
  createdAt: string,
) {
  return {
    id: `${productId}-${createdAt}`,
    productId,
    productCode,
    productName,
    systemStock,
    countedQuantity,
    difference: countedQuantity - systemStock,
    createdAt,
  };
}

describe('GET /api/reports/counts (HU-10)', () => {
  it('resume los conteos del período del negocio de la sesión', async () => {
    const { app, requested } = buildApp();
    const response = await request(app).get(`/api/reports/counts?${PERIOD}`).expect(200);
    const report = response.body.data;
    const total = (label: string) =>
      report.totals.find((item: { label: string }) => item.label === label)?.value;

    expect(requested).toEqual([TEST_BUSINESS_ID]);
    expect(report.kind).toBe('physical-counts');
    expect(report.rowCount).toBe(2);
    expect(report.rows).toBeUndefined();
    // −2 × ₡980 + 1 × ₡2 500 = ₡540
    expect(total('Valor de la diferencia')).toBe('540.00');
    expect(total('Unidades faltantes')).toBe(2);
    expect(total('Unidades sobrantes')).toBe(1);
    expect(report.charts.length).toBeGreaterThan(0);
  });

  it('da las filas por página, la más reciente primero', async () => {
    const { app } = buildApp();
    const page = (
      await request(app).get(`/api/reports/counts/rows?${PERIOD}&pageSize=1`).expect(200)
    ).body.data;

    expect(page.total).toBe(2);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({ code: 'C1', difference: 1, value: '2500.00' });
  });

  it('exporta el mismo reporte a Excel', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .get(`/api/reports/counts/export?${PERIOD}&columns=code,difference`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.load(response.body as unknown as ArrayBuffer);

    const text = JSON.stringify(workbook.worksheets.map((sheet) => sheet.getSheetValues()));

    expect(text).toContain('A1');
    expect(text).not.toContain('Arroz 1 kg');
  });

  it('pide un período válido', async () => {
    const { app } = buildApp();

    await request(app).get('/api/reports/counts').expect(400);
    await request(app).get('/api/reports/counts?from=2026-10-31&to=2026-10-01').expect(400);
  });

  it('el Encargado también lo ve; el Cajero no', async () => {
    await request(buildApp('ENCARGADO').app).get(`/api/reports/counts?${PERIOD}`).expect(200);
    await request(buildApp('CAJERO').app).get(`/api/reports/counts?${PERIOD}`).expect(403);
  });
});
