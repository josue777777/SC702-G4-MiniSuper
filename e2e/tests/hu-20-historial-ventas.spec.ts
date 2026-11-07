import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import type { Sale, DailySalesHistory } from '../../frontend/src/types/sales';
import { E2E_BUSINESS_ID, insertUser, withDb } from '../support/db';
import { BACKEND_URL } from '../support/env';
import { saveEvidence } from '../support/evidence';
import {
  E2E_ADMIN,
  resetCatalog,
  seedProducts,
  signInAsOwner,
  signInVia,
} from '../support/fixtures';

// El navegador está en otra zona: tanto el día como las horas deben seguir siendo de Costa Rica.
test.use({ timezoneId: 'Asia/Tokyo' });

test.beforeEach(async ({ page }) => {
  await signInAsOwner(page);
  await resetCatalog();
  await seedProducts([
    {
      code: 'P001',
      name: 'Café molido 500 g',
      category: 'Bebidas',
      price: '1500.00',
      cost: '1000.00',
      stock: 200,
      supplier: null,
    },
    {
      code: 'P002',
      name: 'Arroz 1 kg',
      category: 'Granos',
      price: '900.00',
      cost: '700.00',
      stock: 200,
      supplier: null,
    },
  ]);
});

async function sell(page: Page, method: 'CASH' | 'CARD' | 'CREDIT'): Promise<Sale> {
  const product = await page.request.get(`${BACKEND_URL}/api/sales/lookup?code=P001`);
  const rice = await page.request.get(`${BACKEND_URL}/api/sales/lookup?code=P002`);
  const customer =
    method === 'CREDIT'
      ? await page.request.post(`${BACKEND_URL}/api/customers`, {
          data: { name: 'Marta Prueba', phone: '' },
        })
      : null;
  const response = await page.request.post(`${BACKEND_URL}/api/sales`, {
    data: {
      idempotencyKey: randomUUID(),
      paymentMethod: method,
      items:
        method === 'CASH'
          ? [
              { productId: (await product.json()).data.id, quantity: 2 },
              { productId: (await rice.json()).data.id, quantity: 1 },
            ]
          : [{ productId: (await product.json()).data.id, quantity: 1 }],
      ...(method === 'CASH' ? { cashReceived: '5000.00' } : {}),
      ...(customer === null ? {} : { customerId: (await customer.json()).data.id }),
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).data as Sale;
}

test('ventas reales, detalle, comprobante y ajustes actualizan el total sin perder auditoría', async ({
  page,
}) => {
  const cash = await sell(page, 'CASH');
  const card = await sell(page, 'CARD');
  const credit = await sell(page, 'CREDIT');
  await page.goto('/sales');
  // El historial está en su propia pestaña, separado de la caja.
  await page.getByRole('tab', { name: 'Historial del día' }).click();
  const history = page.getByRole('region', { name: 'Historial de ventas' });
  const table = history.getByRole('table', { name: 'Historial de ventas' });
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await expect(table.locator('tbody tr').first()).toContainText(`#${credit.number}`);
  await expect(table).toContainText('Café molido 500 g × 2');
  await expect(table).toContainText('Arroz 1 kg × 1');
  await expect(history.getByRole('status', { name: 'Totales del día' })).toContainText(
    /6\s?900,00/,
  );

  await history
    .getByRole('button', { name: `Ver detalle de la venta ${cash.number}`, exact: true })
    .click();
  const detail = page.getByRole('dialog', {
    name: `Detalle de venta #${cash.number}`,
    exact: true,
  });
  await expect(detail.getByRole('table')).toContainText('Café molido 500 g');
  await expect(detail.getByRole('table')).toContainText('Arroz 1 kg');
  await expect(detail).toContainText(/3\s?900,00/);
  await expect(detail).toContainText(/Vuelto original:.*1\s?100,00/);
  await saveEvidence(page, 'HU-20', 'HU-20-detalle-venta.png');
  await detail.getByRole('button', { name: 'Abrir comprobante' }).click();
  const receipt = page.getByRole('dialog', { name: 'Comprobante de venta' });
  await expect(receipt).toContainText(`Venta #${cash.number}`);
  await expect(receipt).toContainText('Arroz 1 kg');
  await receipt.getByRole('button', { name: 'Cerrar', exact: true }).last().click();

  await history
    .getByRole('button', { name: `Anular o devolver la venta ${cash.number}`, exact: true })
    .click();
  const adjustment = page.getByRole('dialog', {
    name: `Ajustes de la venta #${cash.number}`,
    exact: true,
  });
  await adjustment.getByLabel('Cantidad a devolver de Café molido 500 g').fill('1');
  await adjustment.getByLabel('Motivo').fill('Una unidad devuelta en prueba');
  await adjustment.getByRole('button', { name: 'Registrar devolución' }).click();
  await expect(adjustment).not.toBeVisible();
  await expect(table).toContainText('Con devolución');
  await expect(history.getByRole('status', { name: 'Totales del día' })).toContainText(
    /5\s?400,00/,
  );

  await history
    .getByRole('button', { name: `Anular o devolver la venta ${card.number}`, exact: true })
    .click();
  const voidDialog = page.getByRole('dialog', {
    name: `Ajustes de la venta #${card.number}`,
    exact: true,
  });
  await voidDialog
    .getByRole('radio', { name: 'Anular venta y devolver todos los productos restantes' })
    .check();
  await voidDialog.getByLabel('Motivo').fill('Anulación de prueba');
  await voidDialog.getByRole('button', { name: 'Anular venta', exact: true }).click();
  await expect(voidDialog).not.toBeVisible();
  await expect(table).toContainText('Anulada');
  const totals = history.getByRole('status', { name: 'Totales del día' });
  await expect(totals).toContainText(/3\s?900,00/);
  await expect(totals).toContainText(/Total original:.*6\s?900,00/);
  await history.scrollIntoViewIfNeeded();
  await saveEvidence(page, 'HU-20', 'HU-20-historial-ventas-dia.png');
  await totals.scrollIntoViewIfNeeded();
  await saveEvidence(page, 'HU-20', 'HU-20-total-acumulado.png');

  for (const method of ['CASH', 'CARD', 'CREDIT']) {
    await history.getByLabel('Filtrar por método de pago').selectOption(method);
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await expect(totals).toContainText(/3\s?900,00/);
  }
  await withDb(async (db) => {
    const rows = await db.query('SELECT status, total::text FROM "Sale" WHERE id = $1', [cash.id]);
    expect(rows.rows).toEqual([{ status: 'PARTIALLY_RETURNED', total: '2400.00' }]);
    const adjustments = await db.query('SELECT count(*)::int AS count FROM "SaleAdjustment"');
    expect(adjustments.rows[0].count).toBe(2);
  });
});

test('62 ventas, medianoche CR, paginación, rendimiento y aislamiento entre negocios', async ({
  page,
}, testInfo) => {
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
  const start = Date.parse(`${date}T06:00:00.000Z`);
  const foreignId = randomUUID();
  const foreignSaleId = randomUUID();
  await withDb(async (db) => {
    const product = await db.query(
      'SELECT id FROM "Product" WHERE code = $1 AND "businessId" = $2',
      ['P001', E2E_BUSINESS_ID],
    );
    for (let i = 1; i <= 64; i += 1) {
      const id = randomUUID();
      const at =
        i === 62
          ? start - 1
          : i === 63
            ? start + 86_400_000
            : i === 64
              ? start + 86_400_000 - 1
              : start + (i - 1) * 1000;
      await db.query(
        'INSERT INTO "Sale"(id, number, "businessId", "paymentMethod", total, "createdAt") VALUES ($1, $2, $3, $4, 100, $5)',
        [id, i, E2E_BUSINESS_ID, 'CARD', new Date(at).toISOString()],
      );
      await db.query(
        'INSERT INTO "SaleItem"(id, "saleId", "productId", quantity, "unitPrice", "unitCost") VALUES ($1, $2, $3, 1, 100, 50)',
        [randomUUID(), id, product.rows[0].id],
      );
    }
    await db.query('INSERT INTO "Business"(id, name, "updatedAt") VALUES ($1, $2, now())', [
      foreignId,
      'Negocio ajeno de prueba',
    ]);
    await db.query(
      'INSERT INTO "Sale"(id, number, "businessId", "paymentMethod", total, "createdAt") VALUES ($1, 999, $2, $3, 999999, $4)',
      [foreignSaleId, foreignId, 'CARD', new Date(start).toISOString()],
    );
  });
  await page.goto('/sales');
  // El historial está en su propia pestaña, separado de la caja.
  await page.getByRole('tab', { name: 'Historial del día' }).click();
  const history = page.getByRole('region', { name: 'Historial de ventas' });
  const table = history.getByRole('table');
  await expect(table.locator('tbody tr')).toHaveCount(15);
  await expect(history.getByLabel('Día del historial')).toHaveValue(date);
  const measuredAt = performance.now();
  const loaded = page.waitForResponse(
    (response) => response.url().includes('/api/sales/daily-history?') && response.status() === 200,
  );
  await history.getByRole('button', { name: 'Actualizar historial' }).click();
  await loaded;
  await expect(table.locator('tbody tr')).toHaveCount(15);
  const elapsed = performance.now() - measuredAt;
  expect(elapsed).toBeLessThan(2000);
  console.info(`HU-20: historial con 62 ventas cargado en ${elapsed.toFixed(0)} ms.`);
  await testInfo.attach('rendimiento-historial', {
    body: `62 ventas; recarga navegador: ${elapsed.toFixed(0)} ms; Chromium, PostgreSQL local.`,
    contentType: 'text/plain',
  });
  await expect(table.locator('tbody tr').first()).toContainText('#64');
  await expect(table.locator('tbody tr').first()).toContainText('23:59:59');
  await expect(history.getByRole('status', { name: 'Totales del día' })).toContainText(
    /6\s?200,00/,
  );
  // 62 ventas de 15 en 15 (regla 2): la última página tiene las 2 primeras del día.
  for (let next = 2; next <= 5; next += 1) {
    await history.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(history.getByText(`Página ${next} de 5`, { exact: false })).toBeVisible();
  }
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table.locator('tbody tr').last()).toContainText('#1');
  await expect(table.locator('tbody tr').last()).toContainText('0:00:00');
  const response = await page.request.get(
    `${BACKEND_URL}/api/sales/daily-history?date=${date}&businessId=${foreignId}`,
  );
  const data = (await response.json()).data as DailySalesHistory;
  expect(data.day).toEqual({ saleCount: 62, total: '6200.00', originalTotal: '6200.00' });
  expect(data.sales.some((sale) => sale.id === foreignSaleId)).toBe(false);
  expect((await page.request.get(`${BACKEND_URL}/api/sales/${foreignSaleId}`)).status()).toBe(404);
  const other = {
    name: 'Otra encargada',
    email: 'otra.hu20@example.com',
    password: 'ClaveSegura123',
    role: 'ENCARGADO' as const,
    businessId: foreignId,
  };
  await insertUser(other);
  await signInVia(page.request, other);
  const otherResponse = await page.request.get(
    `${BACKEND_URL}/api/sales/daily-history?date=${date}`,
  );
  expect((await otherResponse.json()).data.day).toEqual({
    saleCount: 1,
    total: '999999.00',
    originalTotal: '999999.00',
  });
});

test('día vacío, validación, error recuperable y permisos', async ({ page, request, browser }) => {
  await page.goto('/sales');
  // El historial está en su propia pestaña, separado de la caja.
  await page.getByRole('tab', { name: 'Historial del día' }).click();
  const history = page.getByRole('region', { name: 'Historial de ventas' });
  await expect(history.getByText('No hay ventas registradas en este día.')).toBeVisible();
  await history.getByLabel('Día del historial').fill('2024-02-29');
  await expect(history.getByRole('status', { name: 'Totales del día' })).toContainText('₡0,00');
  await page.route('**/api/sales/daily-history?**', (route) => route.abort());
  await history.getByRole('button', { name: 'Actualizar historial' }).click();
  await expect(history.getByRole('alert')).toBeVisible();
  await expect(history.getByRole('status', { name: 'Totales del día' })).toHaveCount(0);
  await page.unroute('**/api/sales/daily-history?**');
  await history.getByRole('button', { name: 'Reintentar' }).click();
  await expect(history.getByText('No hay ventas registradas en este día.')).toBeVisible();
  expect(
    (await page.request.get(`${BACKEND_URL}/api/sales/daily-history?date=2026-02-30`)).status(),
  ).toBe(400);
  expect((await request.get(`${BACKEND_URL}/api/sales/daily-history`)).status()).toBe(401);
  const warehouse = {
    name: 'Bodega HU20',
    email: 'bodega.hu20@example.com',
    password: 'ClaveSegura123',
    role: 'BODEGA' as const,
  };
  const cashier = {
    ...warehouse,
    name: 'Caja HU20',
    email: 'caja.hu20@example.com',
    role: 'CAJERO' as const,
  };
  await insertUser(warehouse);
  await insertUser(cashier);
  for (const user of [warehouse, E2E_ADMIN, cashier]) {
    const context = await browser.newContext();
    await signInVia(context.request, user);
    expect((await context.request.get(`${BACKEND_URL}/api/sales/daily-history`)).status()).toBe(
      user.role === 'CAJERO' ? 200 : 403,
    );
    await context.close();
  }
});
