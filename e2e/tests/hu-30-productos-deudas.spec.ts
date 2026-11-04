import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { insertUser } from '../support/db';
import { BACKEND_URL, FRONTEND_URL } from '../support/env';
import { saveStackedEvidence } from '../support/evidence';
import { E2E_ADMIN, resetCatalog, signInAsOwner, signInVia } from '../support/fixtures';
import {
  BODEGA,
  CAJERO,
  OTHER_OWNER,
  PERIOD,
  centsOf,
  consult,
  expectExportMatchesScreen,
  openAs,
  openCalculationNotes,
  openDetail,
  openReport,
  productIdByCode,
  readDownload,
  readTable,
  saleIdByNumber,
  seedOtherBusiness,
  seedPayment,
  seedScenario,
  setPeriod,
  summaryValue,
  tile,
  tileCents,
  trackRuntimeErrors,
  type Scenario,
} from '../support/reports';

/**
 * HU-30 — Productos más vendidos y deudas de clientes (issue #30). Navegador
 * real + backend real + PostgreSQL de pruebas, con el escenario sintético de
 * `support/reports.ts`. HU-19 (registro de abonos) todavía no existe: los abonos
 * de estas pruebas se insertan directo en la base y los fiados se crean por la
 * API real de ventas (HU-18).
 */

const TOP = 'Productos más vendidos';
const DEBTS = 'Deudas de clientes';
const NO_DEBTS = 'No hay clientes con deudas pendientes.';

let scenario: Scenario;

test.beforeEach(async ({ page }) => {
  await signInAsOwner(page);
  await resetCatalog();
  scenario = await seedScenario();
  await seedOtherBusiness();
});

test('ranking de productos y deudas de clientes con cifras exactas, y deja la evidencia', async ({
  page,
}) => {
  const errors = trackRuntimeErrors(page);

  // --- A. Productos más vendidos ---
  await openReport(page, 'Más vendidos');
  await setPeriod(page, PERIOD.from, PERIOD.to);
  await consult(page);
  await expect(page.locator('.stat-tile', { hasText: 'Productos distintos' })).toBeVisible();

  const top = await readTable(page, TOP);

  expect(top.headers).toEqual([
    'Posición',
    'Código',
    'Producto',
    'Categoría actual',
    'Unidades vendidas',
    'Importe neto',
  ]);
  // B1 6 | empate de 4 entre M1 y Z1: gana el código menor | A1 3 (sin la anulada #2 ni lo de fuera del período).
  expect(top.rows.map((row) => row.slice(0, 5))).toEqual([
    ['1', 'B1', 'Café molido', 'Bebidas', '6'],
    ['2', 'M1', 'Leche entera', 'Lácteos', '4'],
    ['3', 'Z1', 'Producto descontinuado', 'Granos', '4'],
    ['4', 'A1', 'Arroz 1 kg', 'Granos', '3'],
  ]);
  // Importes con precios históricos, descontando devoluciones (A1: 2 × 900 + 1 × 1.000).
  expect(top.rows.map((row) => centsOf(row[5] ?? ''))).toEqual([
    506_900, 1_000_000, 40_000, 280_000,
  ]);
  expect(await tile(page, 'Productos distintos')).toBe('4');
  expect(await tile(page, 'Unidades netas')).toBe('17');
  expect(await tileCents(page, 'Importe neto')).toBe(1_826_900);
  await openCalculationNotes(page);
  await expect(
    page.getByText('Los productos desactivados aparecen mientras tengan ventas'),
  ).toBeVisible();

  const rankingShot = await page.screenshot({ fullPage: true });

  // --- B. Deudas de clientes ---
  await page.getByRole('tab', { name: 'Deudas de clientes' }).click();
  await expect(page.locator('.stat-tile', { hasText: 'Total general de deudas' })).toBeVisible();

  const debts = await readTable(page, DEBTS);

  expect(debts.headers).toEqual([
    'Cliente',
    'Fiado',
    'Fecha del fiado (Costa Rica)',
    'Monto del fiado',
    'Abonado a este fiado',
    'Monto pendiente',
    'Saldo acumulado del cliente',
  ]);
  // Ana (#8 sin abonos; el #9 ya está cubierto), Beto (₡400 tras devolver 1 de 2) y Zoila (inactiva).
  // Carla (anulado) no debe nada y el cliente del otro negocio no aparece.
  expect(
    debts.rows.map((row) => [...row.slice(0, 3), ...row.slice(3).map((cell) => centsOf(cell))]),
  ).toEqual([
    ['Ana Fiadora', '#8', '2024-03-15 12:00', 100_000, 0, 100_000, 100_000],
    ['Beto Cliente', '#11', '2024-03-18 12:00', 40_000, 0, 40_000, 40_000],
    ['Zoila Inactiva', '#10', '2024-03-17 12:00', 20_000, 0, 20_000, 20_000],
  ]);
  expect(await tileCents(page, 'Total general de deudas')).toBe(160_000);
  expect(await tile(page, 'Clientes con deuda')).toBe('3');
  await expect(page.getByText('Carla Cliente')).toHaveCount(0);
  await expect(page.getByText('Cliente Ajeno')).toHaveCount(0);
  await openCalculationNotes(page);
  await expect(page.getByText('LIMITACIÓN (HU-19)')).toBeVisible();

  const debtsShot = await page.screenshot({ fullPage: true });

  expect(errors).toEqual([]);
  await saveStackedEvidence(page, 'HU-30', 'HU-30-productos-mas-vendidos-deudas.png', [
    rankingShot,
    debtsShot,
  ]);
});

test('el ranking respeta el período y vacío muestra su mensaje', async ({ page }) => {
  await openReport(page, 'Más vendidos');
  await setPeriod(page, '2024-04-01', '2024-04-30');
  await consult(page);

  // Solo la venta #5 (1 de abril, 00:00): A1.
  expect((await readTable(page, TOP)).rows.map((row) => row.slice(1, 5))).toEqual([
    ['A1', 'Arroz 1 kg', 'Granos', '1'],
  ]);

  await setPeriod(page, '2024-05-01', '2024-05-31');
  await consult(page);
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'No hay productos vendidos en el período seleccionado.' }),
  ).toBeVisible();
  await expect(page.getByRole('table', { name: TOP })).toHaveCount(0);

  await setPeriod(page, '2024-05-31', '2024-05-01');
  await page.getByRole('button', { name: 'Generar reporte', exact: true }).click();
  await expect(page.getByText('La fecha final no puede ser anterior a la inicial.')).toBeVisible();
});

test('exporta el ranking y las deudas exactamente como se muestran', async ({ page }) => {
  await openReport(page, 'Más vendidos');
  await setPeriod(page, PERIOD.from, PERIOD.to);
  await consult(page);

  const topScreen = await readTable(page, TOP);
  const [topDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Exportar productos más vendidos a Excel/ }).click(),
  ]);
  const topFile = await readDownload(topDownload);

  expect(topFile.fileName).toBe('reporte-top-products.xlsx');
  expectExportMatchesScreen(topScreen, topFile, ['Importe neto']);
  expect(summaryValue(topFile, 'Desde')).toBe('2024-03-01');
  expect(summaryValue(topFile, 'Unidades netas')).toBe(17);

  await page.getByRole('tab', { name: 'Deudas de clientes' }).click();

  const debtsScreen = await readTable(page, DEBTS);
  const [debtsDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Exportar deudas de clientes a Excel/ }).click(),
  ]);
  const debtsFile = await readDownload(debtsDownload);

  expect(debtsFile.fileName).toBe('reporte-customer-debts.xlsx');
  expectExportMatchesScreen(debtsScreen, debtsFile, [
    'Monto del fiado',
    'Abonado a este fiado',
    'Monto pendiente',
    'Saldo acumulado del cliente',
  ]);
  expect(summaryValue(debtsFile, 'Total general de deudas')).toBe(1600);
  expect(summaryValue(debtsFile, 'Clientes con deuda')).toBe(3);
});

test('las deudas reflejan fiados y abonos nuevos sin reiniciar la aplicación', async ({ page }) => {
  await openReport(page, 'Deudas de clientes');
  await openDetail(page);
  await expect(page.getByRole('table', { name: DEBTS })).toBeVisible();
  expect(await tileCents(page, 'Total general de deudas')).toBe(160_000);

  // Un fiado NUEVO por la API real de ventas (HU-18): Ana lleva 1 unidad a ₡5.000.
  const sale = await page.request.post(`${BACKEND_URL}/api/sales`, {
    headers: { Origin: FRONTEND_URL },
    data: {
      idempotencyKey: randomUUID(),
      paymentMethod: 'CREDIT',
      customerId: scenario.customers.ana,
      items: [{ productId: await productIdByCode('A1'), quantity: 1 }],
    },
  });

  expect(sale.status()).toBe(201);
  await consult(page, 'Actualizar');
  expect(await tileCents(page, 'Total general de deudas')).toBe(660_000);

  const ana = async () =>
    (await readTable(page, DEBTS)).rows
      .filter((row) => row[0] === 'Ana Fiadora')
      .map((row) => [row[1], centsOf(row[5] ?? ''), centsOf(row[6] ?? '')]);

  expect(await ana()).toEqual([
    ['#8', 100_000, 100_000],
    ['#14', 500_000, 600_000],
  ]);

  // Un abono general: no se reparte entre fiados, se descuenta en una línea aparte.
  await seedPayment(scenario.customers.ana, '1500.00');
  await consult(page, 'Actualizar');
  expect(await tileCents(page, 'Total general de deudas')).toBe(510_000);
  expect(await ana()).toEqual([
    ['#8', 100_000, 100_000],
    ['#14', 500_000, 600_000],
    ['Abonos sin venta asignada', -150_000, 450_000],
  ]);

  // Un abono ligado al primer fiado lo cancela: su fila desaparece y el saldo del cliente baja.
  await seedPayment(scenario.customers.ana, '1000.00', await saleIdByNumber(8));
  await consult(page, 'Actualizar');
  expect(await tileCents(page, 'Total general de deudas')).toBe(410_000);
  expect(await ana()).toEqual([
    ['#14', 500_000, 500_000],
    ['Abonos sin venta asignada', -150_000, 350_000],
  ]);
});

test('sin deudas pendientes muestra el mensaje y total cero', async ({ page }) => {
  await seedPayment(scenario.customers.ana, '1000.00');
  await seedPayment(scenario.customers.beto, '400.00');
  await seedPayment(scenario.customers.zoila, '200.00');

  await openReport(page, 'Deudas de clientes');

  await expect(page.getByRole('status').filter({ hasText: NO_DEBTS })).toBeVisible();
  await expect(page.getByRole('table', { name: DEBTS })).toHaveCount(0);
  expect(await tileCents(page, 'Total general de deudas')).toBe(0);
  expect(await tile(page, 'Clientes con deuda')).toBe('0');
});

async function statuses(request: APIRequestContext, kind: string): Promise<number[]> {
  const query = kind === 'customer-debts' ? '' : `?from=${PERIOD.from}&to=${PERIOD.to}`;

  return Promise.all(
    [`${kind}${query}`, `${kind}/export${query}`].map(async (path) =>
      (await request.get(`${BACKEND_URL}/api/reports/commercial/${path}`)).status(),
    ),
  );
}

test('solo el Encargado ve el ranking y las deudas, y cada negocio solo las suyas', async ({
  page,
  browser,
  request,
}) => {
  await insertUser(CAJERO);
  await insertUser(BODEGA);

  for (const kind of ['top-products', 'customer-debts']) {
    expect(await statuses(request, kind)).toEqual([401, 401]);
  }

  await signInVia(request, E2E_ADMIN);
  expect(await statuses(request, 'customer-debts')).toEqual([403, 403]);

  // La Cajera ya consulta los saldos de sus clientes al fiar, pero este reporte no es suyo.
  for (const user of [CAJERO, BODEGA]) {
    const visitor = await openAs(browser, user);

    expect(await statuses(visitor.context.request, 'customer-debts')).toEqual([403, 403]);
    expect(await statuses(visitor.context.request, 'top-products')).toEqual([403, 403]);
    await visitor.context.close();
  }

  // Un filtro inventado no puede cambiar de negocio.
  const forged = await page.request.get(
    `${BACKEND_URL}/api/reports/commercial/customer-debts?businessId=0e2e0000-0000-4000-8000-000000000002`,
  );

  expect(forged.status()).toBe(400);

  // El otro negocio: solo su cliente (₡7.777) y su producto.
  const other = await openAs(browser, OTHER_OWNER);

  await openReport(other.page, 'Deudas de clientes');
  await openDetail(other.page);
  await expect(other.page.getByRole('table', { name: DEBTS })).toBeVisible();
  expect((await readTable(other.page, DEBTS)).rows.map((row) => row[0])).toEqual(['Cliente Ajeno']);
  expect(await tileCents(other.page, 'Total general de deudas')).toBe(777_700);

  await other.page.getByRole('tab', { name: 'Más vendidos' }).click();
  await setPeriod(other.page, PERIOD.from, PERIOD.to);
  await consult(other.page);
  expect((await readTable(other.page, TOP)).rows.map((row) => row[1])).toEqual(['A1']);
  await expect(other.page.getByText('Arroz 1 kg')).toHaveCount(0);
  await other.context.close();

  // Y el negocio de las pruebas no ve nada del ajeno.
  await openReport(page, 'Deudas de clientes');
  await openDetail(page);
  await expect(page.getByRole('table', { name: DEBTS })).toBeVisible();
  await expect(page.getByText('Cliente Ajeno')).toHaveCount(0);
});
