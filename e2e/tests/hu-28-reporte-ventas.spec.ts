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
  seedOtherBusiness,
  seedScenario,
  setPeriod,
  summaryValue,
  tile,
  tileCents,
  trackRuntimeErrors,
} from '../support/reports';

/**
 * HU-28 — Reporte de ventas (issue #28). Navegador real + backend real +
 * PostgreSQL de pruebas, con el escenario sintético de `support/reports.ts`
 * (marzo de 2024, hora de Costa Rica).
 */

const REPORT = 'Reporte de ventas';
const EMPTY = 'No hay ventas que coincidan con los filtros seleccionados.';

test.beforeEach(async ({ page }) => {
  await signInAsOwner(page);
  await resetCatalog();
  await seedScenario();
  await seedOtherBusiness();
});

test('muestra las ventas del período con totales exactos y deja la evidencia', async ({ page }) => {
  const errors = trackRuntimeErrors(page);

  await openReport(page, 'Ventas');

  // El período inicial es el mes actual: no hay ventas, y se dice con claridad.
  await expect(page.getByRole('status').filter({ hasText: EMPTY })).toBeVisible();

  await setPeriod(page, PERIOD.from, PERIOD.to);
  await consult(page);

  // Totales: neto = original − devuelto; la anulada (#2, #12) no cuenta y la #3 se devolvió entera.
  await expect(page.locator('.stat-tile', { hasText: 'Total vendido (neto)' })).toBeVisible();
  expect(await tileCents(page, 'Total vendido (neto)')).toBe(1_826_900);
  expect(await tileCents(page, 'Importe original')).toBe(1_976_900);
  expect(await tileCents(page, 'Devuelto')).toBe(150_000);
  // Ocho ventas distintas aunque la #1 tenga dos productos; las devueltas/anuladas no cuentan.
  expect(await tile(page, 'Transacciones')).toBe('8');
  expect(await tile(page, 'Unidades netas')).toBe('17');

  const { headers, rows } = await readTable(page, REPORT);

  expect(headers).toEqual([
    'Venta',
    'Fecha (Costa Rica)',
    'Código',
    'Producto',
    'Categoría actual',
    'Precio histórico',
    'Vendidas',
    'Devueltas',
    'Netas',
    'Importe original',
    'Devuelto',
    'Importe neto',
  ]);
  expect(rows.map((row) => row[0])).toEqual([
    '#4',
    '#13',
    '#11',
    '#10',
    '#9',
    '#8',
    '#3',
    '#1',
    '#1',
    '#6',
  ]);

  // Ni las anuladas ni las que caen un segundo fuera del período.
  const sales = rows.map((row) => row[0]);

  for (const excluded of ['#2', '#5', '#7', '#12']) {
    expect(sales).not.toContain(excluded);
  }

  // El último día entra completo y el primero desde las 00:00 (hora de Costa Rica).
  expect(rows[0]?.[1]).toBe('2024-03-31 23:59');
  expect(rows.at(-1)?.[1]).toBe('2024-03-01 00:00');

  // Venta #1: precio histórico (₡900, no los ₡5.000 de hoy) y la devolución parcial ajustada.
  const rice = rows.find((row) => row[0] === '#1' && row[2] === 'A1');

  expect(rice?.slice(3, 5)).toEqual(['Arroz 1 kg', 'Granos']);
  expect(rice?.slice(6, 9)).toEqual(['3', '1', '2']);
  expect([rice?.[5], rice?.[9], rice?.[10], rice?.[11]].map((cell) => centsOf(cell ?? ''))).toEqual(
    [90_000, 270_000, 90_000, 180_000],
  );

  // La venta devuelta por completo se muestra con neto en cero.
  const returned = rows.find((row) => row[0] === '#3');

  expect(returned?.[8]).toBe('0');
  expect(centsOf(returned?.[11] ?? '')).toBe(0);

  await openCalculationNotes(page);
  await expect(page.getByText('categoría que el producto tiene hoy')).toBeVisible();

  expect(errors).toEqual([]);
  await saveEvidence(page, 'HU-28', 'HU-28-reporte-ventas.png', { fullPage: true });
});

test('combina categoría, precio histórico y fechas', async ({ page }) => {
  await openReport(page, 'Ventas');
  await setPeriod(page, PERIOD.from, PERIOD.to);

  // Categoría ACTUAL del producto: Arroz y el descontinuado.
  await page.getByLabel('Categoría actual del producto').selectOption({ label: 'Granos' });
  await consult(page);
  expect(await tileCents(page, 'Total vendido (neto)')).toBe(320_000);
  expect(await tile(page, 'Transacciones')).toBe('3');
  expect(new Set((await readTable(page, REPORT)).rows.map((row) => row[4]))).toEqual(
    new Set(['Granos']),
  );
  await expect(page.getByText('Categoría actual: Granos')).toBeVisible();

  // Precio HISTÓRICO de la línea (el catálogo vale ₡5.000 hoy, pero se cobró ₡1.000 a ₡1.500).
  await page
    .getByLabel('Categoría actual del producto')
    .selectOption({ label: 'Todas las categorías' });
  await page.getByLabel('Precio mínimo').fill('1000');
  await page.getByLabel('Precio máximo').fill('1500');
  await consult(page);
  expect(await tileCents(page, 'Total vendido (neto)')).toBe(496_900);
  expect(await tile(page, 'Transacciones')).toBe('3');
  expect((await readTable(page, REPORT)).rows.map((row) => centsOf(row[5] ?? ''))).toEqual([
    150_000, 100_000, 123_450,
  ]);

  // Los tres filtros juntos.
  await page.getByLabel('Categoría actual del producto').selectOption({ label: 'Granos' });
  await consult(page);
  expect(await tileCents(page, 'Total vendido (neto)')).toBe(100_000);
  expect(await tile(page, 'Transacciones')).toBe('1');

  // Un solo día: el último del período.
  await page
    .getByLabel('Categoría actual del producto')
    .selectOption({ label: 'Todas las categorías' });
  await page.getByLabel('Precio mínimo').fill('');
  await page.getByLabel('Precio máximo').fill('');
  await setPeriod(page, '2024-03-31', '2024-03-31');
  await consult(page);
  expect((await readTable(page, REPORT)).rows).toHaveLength(1);
  expect(await tileCents(page, 'Total vendido (neto)')).toBe(150_000);
});

test('valida los filtros con mensajes visibles y sin consultar al servidor', async ({ page }) => {
  await openReport(page, 'Ventas');

  const requests: string[] = [];

  page.on('request', (request) => {
    if (request.url().includes('/api/reports/commercial/')) {
      requests.push(request.url());
    }
  });

  const submit = () => page.getByRole('button', { name: 'Generar reporte', exact: true }).click();

  await page.getByLabel('Desde').fill('');
  await submit();
  await expect(page.getByText('Indique la fecha inicial.')).toBeVisible();

  await setPeriod(page, '2024-03-31', '2024-03-01');
  await submit();
  await expect(page.getByText('La fecha final no puede ser anterior a la inicial.')).toBeVisible();

  await setPeriod(page, '2023-01-01', '2024-03-31');
  await submit();
  await expect(page.getByText('El período no puede superar 366 días.')).toBeVisible();

  await setPeriod(page, PERIOD.from, PERIOD.to);
  await page.getByLabel('Precio mínimo').fill('abc');
  await submit();
  await expect(page.getByText('Use un importe sin signo y con hasta dos decimales.')).toBeVisible();

  await page.getByLabel('Precio mínimo').fill('500');
  await page.getByLabel('Precio máximo').fill('100');
  await submit();
  await expect(page.getByText('El precio máximo debe ser mayor o igual al mínimo.')).toBeVisible();

  expect(requests).toEqual([]);

  // Corregidos los datos, el reporte sí se consulta.
  await page.getByLabel('Precio mínimo').fill('');
  await page.getByLabel('Precio máximo').fill('');
  await consult(page);
  await expect(page.getByText('El precio máximo debe ser mayor o igual al mínimo.')).toBeHidden();
  expect(await tileCents(page, 'Total vendido (neto)')).toBe(1_826_900);
});

test('sin resultados muestra el estado vacío y los totales en cero', async ({ page }) => {
  await openReport(page, 'Ventas');
  await setPeriod(page, PERIOD.from, PERIOD.to);
  await page.getByLabel('Precio mínimo').fill('90000');
  await consult(page);

  await expect(page.getByRole('status').filter({ hasText: EMPTY })).toBeVisible();
  await expect(page.getByRole('table', { name: REPORT })).toHaveCount(0);
  expect(await tileCents(page, 'Total vendido (neto)')).toBe(0);
  expect(await tile(page, 'Transacciones')).toBe('0');
});

test('exporta a Excel exactamente lo que se muestra, con sus filtros aplicados', async ({
  page,
}) => {
  await openReport(page, 'Ventas');
  await setPeriod(page, PERIOD.from, PERIOD.to);
  await page.getByLabel('Categoría actual del producto').selectOption({ label: 'Granos' });
  await consult(page);

  const screen = await readTable(page, REPORT);

  // Escribir en el formulario SIN consultar no cambia lo exportado: es lo que está en pantalla.
  await page.getByLabel('Precio mínimo').fill('999');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Exportar reporte de ventas a Excel/ }).click(),
  ]);
  const exported = await readDownload(download);

  expect(exported.fileName).toBe('reporte-sales.xlsx');
  expectExportMatchesScreen(screen, exported, [
    'Precio histórico',
    'Importe original',
    'Devuelto',
    'Importe neto',
  ]);
  expect(summaryValue(exported, 'Desde')).toBe('2024-03-01');
  expect(summaryValue(exported, 'Hasta')).toBe('2024-03-31');
  expect(summaryValue(exported, 'Categoría actual')).toBe('Granos');
  expect(summaryValue(exported, 'Precio mínimo')).toBe('Sin mínimo');
  expect(summaryValue(exported, 'Total vendido (neto)')).toBe(3200);
  expect(summaryValue(exported, 'Transacciones')).toBe(3);
  await expect(page.getByRole('status').filter({ hasText: 'Reporte exportado' })).toContainText(
    'reporte-sales.xlsx',
  );
});

test('HU-40: un reporte sin datos no se exporta vacío y dice por qué', async ({ page }) => {
  await openReport(page, 'Ventas');
  await setPeriod(page, PERIOD.from, PERIOD.to);
  await page.getByLabel('Precio mínimo').fill('90000');
  await consult(page);

  await expect(page.getByRole('status').filter({ hasText: EMPTY })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Exportar reporte de ventas a Excel/ }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: /Descargar reporte de ventas en PDF/ }),
  ).toBeDisabled();
  await expect(
    page.getByText('Sin datos: no hay nada que exportar con estos filtros.'),
  ).toBeVisible();
});

async function apiStatuses(request: APIRequestContext, paths: string[]): Promise<number[]> {
  return Promise.all(
    paths.map(async (path) => (await request.get(`${BACKEND_URL}${path}`)).status()),
  );
}

const REPORT_APIS = [
  `/api/reports/commercial/sales?from=${PERIOD.from}&to=${PERIOD.to}`,
  `/api/reports/commercial/sales/export?from=${PERIOD.from}&to=${PERIOD.to}`,
  '/api/reports/commercial/options',
];

test('solo el Encargado accede: Cajero, Bodega, la plataforma y sin sesión no', async ({
  page,
  browser,
  request,
}) => {
  await insertUser(CAJERO);
  await insertUser(BODEGA);

  // Sin sesión.
  expect(await apiStatuses(request, REPORT_APIS)).toEqual([401, 401, 401]);

  // La plataforma no entra a los datos de los negocios.
  await signInVia(request, E2E_ADMIN);
  expect(await apiStatuses(request, REPORT_APIS)).toEqual([403, 403, 403]);

  // Cajero: vende y fía, pero no ve reportes.
  const cajera = await openAs(browser, CAJERO);

  expect(await apiStatuses(cajera.context.request, REPORT_APIS)).toEqual([403, 403, 403]);
  await cajera.page.goto('/reports');
  await expect(cajera.page.getByRole('heading', { name: 'Acceso no permitido' })).toBeVisible();
  await cajera.context.close();

  // Bodega: tiene reportes de INVENTARIO, no los financieros.
  const bodeguero = await openAs(browser, BODEGA);

  expect(await apiStatuses(bodeguero.context.request, REPORT_APIS)).toEqual([403, 403, 403]);
  await bodeguero.page.goto('/reports');
  await expect(bodeguero.page.getByRole('heading', { level: 1 })).toContainText('Reportes');
  await expect(bodeguero.page.getByText('Pendiente de implementar')).toBeVisible();
  await expect(bodeguero.page.getByRole('heading', { name: 'Reportes comerciales' })).toHaveCount(
    0,
  );
  // Solo su reporte de inventario (HU-25); ninguna pestaña financiera.
  await expect(bodeguero.page.getByRole('tab')).toHaveText(['Inventario']);
  await expect(bodeguero.page.getByRole('tab', { name: 'Ventas' })).toHaveCount(0);
  await bodeguero.context.close();

  // La Encargada (sesión abierta en `beforeEach`) sí.
  await openReport(page, 'Ventas');
});

test('un negocio no ve las ventas de otro', async ({ page, browser, request }) => {
  const errors = trackRuntimeErrors(page);

  await openReport(page, 'Ventas');
  await setPeriod(page, PERIOD.from, PERIOD.to);
  await consult(page);

  // Nada del negocio ajeno (₡99.999 y ₡7.777 en el mismo período y con el mismo código A1).
  expect(await tileCents(page, 'Total vendido (neto)')).toBe(1_826_900);
  await expect(page.getByText('Producto del negocio ajeno')).toHaveCount(0);

  const other = await openAs(browser, OTHER_OWNER);

  await openReport(other.page, 'Ventas');
  await setPeriod(other.page, PERIOD.from, PERIOD.to);
  await consult(other.page);
  expect(await tileCents(other.page, 'Total vendido (neto)')).toBe(10_777_600);
  expect(await tile(other.page, 'Transacciones')).toBe('2');
  await expect(other.page.getByText('Arroz 1 kg')).toHaveCount(0);

  // Ni por la API: el negocio sale de la sesión, no de la petición.
  const forged = await other.context.request.get(
    `${BACKEND_URL}/api/reports/commercial/sales?from=${PERIOD.from}&to=${PERIOD.to}&businessId=0e2e0000-0000-4000-8000-000000000001`,
  );

  expect(forged.status()).toBe(400);

  // Una categoría de OTRO negocio no existe para este.
  await signInVia(request, { email: 'duena.prueba@example.com', password: 'ClaveSegura123' });

  const options = (await (
    await request.get(`${BACKEND_URL}/api/reports/commercial/options`)
  ).json()) as {
    data: { categories: { id: string; name: string }[] };
  };
  const foreignCategory = options.data.categories.find((category) => category.name === 'Granos');
  const lookup = await other.context.request.get(
    `${BACKEND_URL}/api/reports/commercial/sales?from=${PERIOD.from}&to=${PERIOD.to}&categoryId=${foreignCategory?.id}`,
  );

  expect(foreignCategory).toBeDefined();
  expect(lookup.status()).toBe(404);

  await other.context.close();
  expect(errors).toEqual([]);
});
