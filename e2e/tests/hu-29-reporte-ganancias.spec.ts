import { expect, test, type APIRequestContext } from '@playwright/test';
import { insertUser } from '../support/db';
import { BACKEND_URL } from '../support/env';
import { saveEvidence } from '../support/evidence';
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
  openReport,
  readDownload,
  readTable,
  saleIdByNumber,
  seedOtherBusiness,
  seedPayment,
  seedSale,
  seedScenario,
  setPeriod,
  summaryValue,
  tile,
  tileCents,
  trackRuntimeErrors,
  type Scenario,
} from '../support/reports';

/**
 * HU-29 — Reporte de ganancias (issue #29). Navegador real + backend real +
 * PostgreSQL de pruebas, con el escenario sintético de `support/reports.ts`.
 *
 * Ganancia = (precio histórico − costo histórico) × unidades netas. HU-19 (abonos)
 * todavía no existe: solo cuentan los fiados con un abono LIGADO a su venta que
 * los cubre; el resto se excluye y se informa.
 */

const REPORT = 'Reporte de ganancias';
const EMPTY = 'No hay ventas cobradas verificables en el período seleccionado.';

let scenario: Scenario;

test.beforeEach(async ({ page }) => {
  await signInAsOwner(page);
  await resetCatalog();
  scenario = await seedScenario();
  await seedOtherBusiness();
});

test('calcula la ganancia bruta con precios y costos históricos y deja la evidencia', async ({
  page,
}) => {
  const errors = trackRuntimeErrors(page);

  await openReport(page, 'Ganancias');
  await expect(page.getByRole('status').filter({ hasText: EMPTY })).toBeVisible();
  // Este reporte solo filtra por fechas.
  await expect(page.getByLabel('Precio mínimo')).toHaveCount(0);
  await expect(page.getByLabel('Categoría actual del producto')).toHaveCount(0);

  await setPeriod(page, PERIOD.from, PERIOD.to);
  await consult(page);
  await expect(page.locator('.stat-tile', { hasText: 'Ganancia bruta' })).toBeVisible();

  // Contado: #4 500 | #13 2.800 | #6 200 | #1 (A1 2×200 + B1 2×235,45). Fiado cubierto (#9): 200.
  expect(await tileCents(page, 'Ganancia bruta')).toBe(457_090);
  expect(await tileCents(page, 'Ingresos considerados')).toBe(1_666_900);
  expect(await tileCents(page, 'Costos correspondientes')).toBe(1_209_810);
  expect(await tile(page, 'Ventas consideradas')).toBe('5');
  // Fiados #8 (₡1.000, sin abonos), #10 (₡200) y #11 (₡400 tras la devolución): pendientes.
  expect(await tile(page, 'Fiados excluidos (pendientes)')).toBe('3');
  expect(await tileCents(page, 'Monto de fiados excluidos')).toBe(160_000);

  const { headers, rows } = await readTable(page, REPORT);

  expect(headers).toEqual([
    'Venta',
    'Fecha (Costa Rica)',
    'Código',
    'Producto',
    'Pago',
    'Unidades netas',
    'Precio histórico',
    'Costo histórico',
    'Ingresos',
    'Costos',
    'Ganancia bruta',
  ]);
  expect(rows.map((row) => `${row[0]} ${row[2]}`)).toEqual([
    '#4 B1',
    '#13 M1',
    '#9 B1',
    '#1 A1',
    '#1 B1',
    '#6 Z1',
  ]);

  // Sin anuladas (#2, #12), sin la devuelta por completo (#3) y sin fiados pendientes.
  const sales = rows.map((row) => row[0]);

  for (const excluded of ['#2', '#3', '#12', '#8', '#10', '#11', '#5', '#7']) {
    expect(sales).not.toContain(excluded);
  }

  // #1 A1: 3 vendidas, 1 devuelta → 2 netas con los valores de ENTONCES (₡900 / ₡700), no los de hoy.
  const rice = rows.find((row) => row[0] === '#1' && row[2] === 'A1');

  expect(rice?.[4]).toBe('Efectivo');
  expect(rice?.[5]).toBe('2');
  expect(
    [rice?.[6], rice?.[7], rice?.[8], rice?.[9], rice?.[10]].map((cell) => centsOf(cell ?? '')),
  ).toEqual([90_000, 70_000, 180_000, 140_000, 40_000]);

  // El fiado que sí se cobró (abono ligado a la venta) se identifica como tal.
  expect(rows.find((row) => row[0] === '#9')?.[4]).toBe('Fiado cobrado');
  expect(centsOf(rows.find((row) => row[0] === '#1' && row[2] === 'B1')?.[10] ?? '')).toBe(47_090);

  // Sin productos de costo ₡0 no hay ningún aviso que distraiga.
  await expect(page.getByText('sin costo registrado')).toHaveCount(0);

  // Las limitaciones reales siguen completas a un clic, en «Cómo se calcula».
  await openCalculationNotes(page);
  await expect(page.getByText('LIMITACIÓN (HU-19)')).toBeVisible();
  await expect(page.getByText('LIMITACIÓN (costos)')).toBeVisible();
  await expect(page.getByText('sin repartir ganancias por estimación')).toBeVisible();

  expect(errors).toEqual([]);
  await saveEvidence(page, 'HU-29', 'HU-29-reporte-ganancias.png', { fullPage: true });
});

test('solo cuentan los fiados cubiertos por abonos ligados, y el reporte se actualiza al consultar', async ({
  page,
}) => {
  await openReport(page, 'Ganancias');
  await setPeriod(page, PERIOD.from, PERIOD.to);
  await consult(page);
  expect(await tileCents(page, 'Ganancia bruta')).toBe(457_090);

  // Un abono GENERAL (sin venta) no se atribuye a ningún fiado, aunque cubra el monto.
  await seedPayment(scenario.customers.ana, '1000.00');
  // Un abono PARCIAL ligado: no se sabe qué productos cubrió.
  await seedPayment(scenario.customers.beto, '100.00', await saleIdByNumber(11));
  // Un abono ligado a la venta pero de OTRO cliente no vale.
  await seedPayment(scenario.customers.carla, '200.00', await saleIdByNumber(10));
  await consult(page);

  expect(await tileCents(page, 'Ganancia bruta')).toBe(457_090);
  expect(await tile(page, 'Fiados excluidos (pendientes)')).toBe('3');

  // El fiado de Zoila (#10, B1 ₡200 con costo ₡100) queda cubierto por SU abono ligado: suma ₡100.
  await seedPayment(scenario.customers.zoila, '200.00', await saleIdByNumber(10));
  await consult(page);

  expect(await tileCents(page, 'Ganancia bruta')).toBe(467_090);
  expect(await tile(page, 'Ventas consideradas')).toBe('6');
  expect(await tile(page, 'Fiados excluidos (pendientes)')).toBe('2');
  expect(await tileCents(page, 'Monto de fiados excluidos')).toBe(140_000);
  expect((await readTable(page, REPORT)).rows.map((row) => row[0])).toContain('#10');
});

test('sin ventas cobradas verificables muestra el estado vacío e informa el fiado pendiente', async ({
  page,
}) => {
  await openReport(page, 'Ganancias');
  // El 15 de marzo solo hubo el fiado #8 de Ana, sin abonos.
  await setPeriod(page, '2024-03-15', '2024-03-15');
  await consult(page);

  await expect(page.getByRole('status').filter({ hasText: EMPTY })).toBeVisible();
  await expect(page.getByRole('table', { name: REPORT })).toHaveCount(0);
  expect(await tileCents(page, 'Ganancia bruta')).toBe(0);
  expect(await tile(page, 'Fiados excluidos (pendientes)')).toBe('1');
  expect(await tileCents(page, 'Monto de fiados excluidos')).toBe(100_000);
});

test('advierte, nombrando el producto, cuando una venta tiene costo ₡0', async ({ page }) => {
  // Una venta cobrada de M1 registrada sin costo: su ganancia no es exacta.
  await seedSale({
    at: '2024-03-15T10:00:00',
    lines: [{ code: 'M1', quantity: 1, unitPrice: '2500.00', unitCost: '0.00' }],
  });

  await openReport(page, 'Ganancias');
  await setPeriod(page, PERIOD.from, PERIOD.to);
  await consult(page);

  const warning = page.getByRole('alert').filter({ hasText: 'sin costo registrado' });

  await expect(warning).toBeVisible();
  await expect(warning).toContainText('M1 ·');
  await expect(warning).toContainText('Registre su costo en Inventario.');
});

test('valida las fechas con mensajes visibles', async ({ page }) => {
  await openReport(page, 'Ganancias');

  const requests: string[] = [];

  page.on('request', (request) => {
    if (request.url().includes('/api/reports/commercial/')) {
      requests.push(request.url());
    }
  });

  await setPeriod(page, '2024-03-31', '2024-03-01');
  await page.getByRole('button', { name: 'Generar reporte', exact: true }).click();
  await expect(page.getByText('La fecha final no puede ser anterior a la inicial.')).toBeVisible();

  await page.getByLabel('Hasta').fill('');
  await page.getByRole('button', { name: 'Generar reporte', exact: true }).click();
  await expect(page.getByText('Indique la fecha final.')).toBeVisible();
  expect(requests).toEqual([]);
});

test('exporta a Excel exactamente lo que se muestra, con las advertencias', async ({ page }) => {
  await openReport(page, 'Ganancias');
  await setPeriod(page, PERIOD.from, PERIOD.to);
  await consult(page);

  const screen = await readTable(page, REPORT);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Exportar reporte de ganancias a Excel/ }).click(),
  ]);
  const exported = await readDownload(download);

  expect(exported.fileName).toBe('reporte-profits.xlsx');
  expectExportMatchesScreen(screen, exported, [
    'Precio histórico',
    'Costo histórico',
    'Ingresos',
    'Costos',
    'Ganancia bruta',
  ]);
  expect(summaryValue(exported, 'Desde')).toBe('2024-03-01');
  expect(summaryValue(exported, 'Hasta')).toBe('2024-03-31');
  expect(summaryValue(exported, 'Ganancia bruta')).toBe(4570.9);
  expect(summaryValue(exported, 'Ingresos considerados')).toBe(16_669);
  expect(summaryValue(exported, 'Costos correspondientes')).toBe(12_098.1);
  expect(summaryValue(exported, 'Fiados excluidos (pendientes)')).toBe(3);

  const notes = exported.summary.filter((row) => row[0] === 'Nota').map((row) => String(row[1]));

  expect(notes.some((note) => note.includes('LIMITACIÓN (HU-19)'))).toBe(true);
  expect(notes.some((note) => note.includes('LIMITACIÓN (costos)'))).toBe(true);
});

async function statuses(request: APIRequestContext, path: string): Promise<number[]> {
  return Promise.all(
    [path, `${path.replace('profits', 'profits/export')}`].map(async (url) =>
      (await request.get(`${BACKEND_URL}${url}`)).status(),
    ),
  );
}

const PROFITS_API = `/api/reports/commercial/profits?from=${PERIOD.from}&to=${PERIOD.to}`;

test('solo el Encargado ve ganancias y cada negocio solo las suyas', async ({
  page,
  browser,
  request,
}) => {
  await insertUser(CAJERO);
  await insertUser(BODEGA);

  expect(await statuses(request, PROFITS_API)).toEqual([401, 401]);

  await signInVia(request, E2E_ADMIN);
  expect(await statuses(request, PROFITS_API)).toEqual([403, 403]);

  for (const user of [CAJERO, BODEGA]) {
    const visitor = await openAs(browser, user);

    expect(await statuses(visitor.context.request, PROFITS_API)).toEqual([403, 403]);
    await visitor.context.close();
  }

  // Otro negocio: ₡99.999 − ₡1 de ganancia; el fiado de ₡7.777 sigue pendiente y se excluye.
  const other = await openAs(browser, OTHER_OWNER);

  await openReport(other.page, 'Ganancias');
  await setPeriod(other.page, PERIOD.from, PERIOD.to);
  await consult(other.page);
  expect(await tileCents(other.page, 'Ganancia bruta')).toBe(9_999_800);
  expect(await tile(other.page, 'Fiados excluidos (pendientes)')).toBe('1');
  expect(await tileCents(other.page, 'Monto de fiados excluidos')).toBe(777_700);
  await expect(other.page.getByText('Arroz 1 kg')).toHaveCount(0);
  await other.context.close();

  // El negocio de las pruebas (sesión abierta en `beforeEach`) no ve nada del ajeno.
  await openReport(page, 'Ganancias');
  await setPeriod(page, PERIOD.from, PERIOD.to);
  await consult(page);
  expect(await tileCents(page, 'Ganancia bruta')).toBe(457_090);
});
