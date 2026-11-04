import { expect, test } from '@playwright/test';
import { saveEvidence } from '../support/evidence';
import { resetCatalog, seedProducts, signInAsOwner } from '../support/fixtures';
import {
  PERIOD,
  consult,
  openDetail,
  openReport,
  readDownload,
  readTable,
  seedSale,
  seedScenario,
  setPeriod,
} from '../support/reports';

/**
 * HU-40 — Exportar reportes a PDF o Excel (issue #40). Todos los reportes
 * tienen las mismas acciones: personalizar columnas, PDF y Excel; lo exportado
 * conserva los filtros y las columnas que se ven. El reporte de inventario vive
 * ahora en Reportes, y el botón de Inventario lleva a él.
 */

const REPORT = 'Reporte de ventas';

test.beforeEach(async ({ page }) => {
  await signInAsOwner(page);
  await resetCatalog();
  await seedScenario();
});

test('personalizar columnas cambia la tabla, el PDF y el Excel, y se recuerda', async ({
  page,
}) => {
  await openReport(page, 'Ventas');
  await setPeriod(page, PERIOD.from, PERIOD.to);
  await consult(page);

  // Personaliza: oculta dos columnas.
  await page.getByRole('button', { name: 'Personalizar reporte' }).click();
  const customize = page.getByRole('dialog', { name: 'Personaliza tu reporte' });

  // La primera columna no se puede ocultar.
  await expect(customize.getByRole('switch', { name: 'Venta' })).toBeDisabled();
  await customize.getByText('Categoría actual').click();
  await customize.getByText('Devueltas').click();
  await saveEvidence(page, 'HU-40', 'HU-40-personalizar-reporte.png');
  await customize.getByRole('button', { name: 'Aplicar' }).click();

  const screen = await readTable(page, REPORT);

  expect(screen.headers).not.toContain('Categoría actual');
  expect(screen.headers).not.toContain('Devueltas');
  expect(screen.headers).toContain('Importe neto');

  // PDF: la vista previa trae las mismas columnas y los filtros.
  await page.getByRole('button', { name: /Descargar reporte de ventas en PDF/ }).click();
  const preview = page.getByRole('dialog', { name: `Vista previa: ${REPORT}` });
  const documentPdf = preview.getByRole('article', { name: 'Documento del reporte' });

  await expect(documentPdf).toContainText('Desde: 2024-03-01');
  await expect(documentPdf.locator('thead th')).toHaveText(screen.headers);
  await expect(preview.getByRole('button', { name: /Imprimir \/ Guardar PDF/ })).toBeVisible();
  await saveEvidence(page, 'HU-40', 'HU-40-vista-previa-pdf.png');
  await preview.getByRole('button', { name: 'Cerrar', exact: true }).last().click();

  // Excel: las mismas columnas que la pantalla.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Exportar reporte de ventas a Excel/ }).click(),
  ]);
  const exported = await readDownload(download);

  expect(exported.data[0]).toEqual(screen.headers);
  expect(exported.data).toHaveLength(screen.rows.length + 1);

  // Se recuerda en este navegador.
  await page.reload();
  await setPeriod(page, PERIOD.from, PERIOD.to);
  await consult(page);
  expect((await readTable(page, REPORT)).headers).not.toContain('Devueltas');
});

test('el reporte de inventario está en Reportes, con las mismas acciones, y se abre desde Inventario', async ({
  page,
}) => {
  await page.goto('/inventory');
  await page.getByRole('button', { name: /Reporte de inventario/ }).click();

  await expect(page).toHaveURL(/\/reports\?reporte=inventario/);
  await expect(page.getByRole('tab', { name: 'Inventario' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // En pantalla: resumen y gráficos; el detalle, a pedido.
  await expect(
    page.getByRole('figure', { name: 'Valor del inventario por categoría' }),
  ).toBeVisible();
  await openDetail(page);
  await expect(page.getByRole('table', { name: 'Stock de productos' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Descargar reporte de inventario en PDF/ }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: /Exportar reporte de inventario a Excel/ }),
  ).toBeEnabled();
  await saveEvidence(page, 'HU-40', 'HU-40-reporte-inventario.png');

  // Personalizar también aquí: el nombre del producto no se puede ocultar.
  await page.getByRole('button', { name: 'Personalizar reporte' }).click();
  const customize = page.getByRole('dialog', { name: 'Personaliza tu reporte' });

  await expect(customize.getByRole('switch', { name: 'Producto' })).toBeDisabled();
  await customize.getByText('Categoría', { exact: true }).click();
  await customize.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByRole('table', { name: 'Stock de productos' })).toBeVisible();
  expect(
    (
      await page
        .getByRole('table', { name: 'Stock de productos' })
        .locator('thead th')
        .allTextContents()
    ).map((text) => text.trim()),
  ).not.toContain('Categoría');

  // Excel del inventario: el mismo reporte (no el catálogo), con las columnas elegidas.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Exportar reporte de inventario a Excel/ }).click(),
  ]);
  const exported = await readDownload(download);

  expect(exported.fileName).toBe('reporte-inventario.xlsx');
  expect(exported.sheet('Productos')[0]).toContain('Producto');
  expect(exported.sheet('Productos')[0]).not.toContain('Categoría');

  // PDF del inventario.
  await page.getByRole('button', { name: /Descargar reporte de inventario en PDF/ }).click();
  await expect(
    page.getByRole('dialog', { name: 'Vista previa: Reporte de inventario' }),
  ).toContainText('Productos activos');
});

test('«Ver detalle» pide las filas al servidor de a una página y se navega con números', async ({
  page,
}) => {
  // Una venta grande: 45 líneas más las del escenario, para tener 3 páginas.
  await seedSale({
    at: '2024-03-22T10:00:00',
    lines: Array.from({ length: 45 }, (_, index) => ({
      code: 'A1',
      quantity: 1,
      unitPrice: `${100 + index}.00`,
      unitCost: '50.00',
    })),
  });

  const rowRequests: string[] = [];

  page.on('request', (request) => {
    if (request.url().includes('/rows')) {
      rowRequests.push(request.url());
    }
  });

  await openReport(page, 'Ventas');
  await consult(page);

  // El resumen llega sin filas: solo cuántas son y los gráficos ya calculados.
  // Los filtros se aplican solos al cambiar el período.
  const [summaryResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/api/reports/commercial/sales?from=${PERIOD.from}&to=${PERIOD.to}`) &&
        response.request().method() === 'GET',
    ),
    setPeriod(page, PERIOD.from, PERIOD.to),
  ]);
  const summary = (await summaryResponse.json()).data;
  const total: number = summary.rowCount;

  expect(summary.rows).toBeUndefined();
  expect(summary.charts.length).toBeGreaterThan(0);
  expect(total).toBeGreaterThan(40);
  await expect(page.getByText(`Ver detalle (${total} filas)`)).toBeVisible();

  // Mientras el detalle está cerrado, no se piden filas.
  expect(rowRequests).toEqual([]);

  await openDetail(page);
  const table = page.getByRole('table', { name: REPORT, exact: true });
  const pages = page.getByRole('navigation', { name: 'Páginas de filas' });

  await expect(table.locator('tbody tr')).toHaveCount(20);
  expect(rowRequests).toHaveLength(1);
  await expect(pages.getByRole('button', { name: 'Ir a la página 1' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // Directo a la última página, sin pasar por la 2.
  await pages.getByRole('button', { name: 'Ir a la página 3' }).click();
  await expect(
    pages.getByText(`Mostrando 41–${total} de ${total} filas · Página 3 de 3`),
  ).toBeVisible();
  await expect(table.locator('tbody tr')).toHaveCount(total - 40);
  await expect(pages.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  expect(rowRequests.some((url) => url.includes('page=2'))).toBe(false);
  await saveEvidence(page, 'HU-40', 'HU-40-detalle-paginado.png');

  // El PDF sigue siendo el documento completo: todas las filas.
  await page.getByRole('button', { name: /Descargar reporte de ventas en PDF/ }).click();
  const preview = page.getByRole('dialog', { name: `Vista previa: ${REPORT}` });

  await expect(
    preview.getByRole('article', { name: 'Documento del reporte' }).locator('tbody tr'),
  ).toHaveCount(total);
});

test('un PDF de miles de filas pregunta antes y ofrece el Excel', async ({ page }) => {
  // Se simula un reporte enorme cambiando solo la cantidad que informa el resumen.
  await page.route(/\/api\/reports\/commercial\/sales\?/, async (route) => {
    const response = await route.fetch();
    const body = await response.json();

    await route.fulfill({ response, json: { data: { ...body.data, rowCount: 12000 } } });
  });

  await openReport(page, 'Ventas');
  await setPeriod(page, PERIOD.from, PERIOD.to);
  await consult(page);
  await page.getByRole('button', { name: /Descargar reporte de ventas en PDF/ }).click();

  const preview = page.getByRole('dialog', { name: `Vista previa: ${REPORT}` });

  await expect(preview).toContainText(/12\s000 filas/);
  await expect(preview.getByRole('button', { name: 'Descargar Excel' })).toBeVisible();
  await preview.getByRole('button', { name: 'Generar el PDF igual' }).click();
  await expect(preview.getByRole('article', { name: 'Documento del reporte' })).toBeVisible();
});

test('inventario: el resumen llega sin filas y cada sección se pide de a una página', async ({
  page,
}) => {
  // 25 productos más los 3 activos del escenario: 28, en 2 páginas.
  await seedProducts(
    Array.from({ length: 25 }, (_, index) => ({
      code: `INV${String(index + 1).padStart(2, '0')}`,
      name: `Producto de inventario ${index + 1}`,
      category: 'Abarrotes',
      price: '1000.00',
      cost: '500.00',
      stock: index + 1,
      supplier: null,
    })),
  );

  const rowRequests: string[] = [];

  page.on('request', (request) => {
    if (request.url().includes('/api/reports/inventory/rows')) {
      rowRequests.push(request.url());
    }
  });

  const [summaryResponse] = await Promise.all([
    page.waitForResponse((response) => /\/api\/reports\/inventory\?/.test(response.url())),
    page.goto('/reports?reporte=inventario'),
  ]);
  const summary = (await summaryResponse.json()).data;

  // El resumen: totales, gráficos y cuántos hay; ninguna fila.
  expect(summary).not.toHaveProperty('products');
  expect(summary.counts.products).toBe(28);
  expect(summary.charts.map((chart: { id: string }) => chart.id)).toEqual([
    'inventory-value',
    'inventory-status',
  ]);
  await expect(page.getByText('Ver detalle (28 productos)')).toBeVisible();
  expect(rowRequests).toEqual([]);

  await openDetail(page);
  const table = page.getByRole('table', { name: 'Stock de productos' });
  const pages = page.getByRole('navigation', { name: 'Páginas de stock de productos' });

  await expect(table.locator('tbody tr')).toHaveCount(20);
  await pages.getByRole('button', { name: 'Ir a la página 2' }).click();
  await expect(pages.getByText('Mostrando 21–28 de 28 productos · Página 2 de 2')).toBeVisible();
  await expect(table.locator('tbody tr')).toHaveCount(8);
  // El total es de TODO el inventario, no solo de la página.
  await expect(table.locator('tfoot')).toContainText('28 producto(s)');
  expect(rowRequests.every((url) => url.includes('section=products'))).toBe(true);
  await saveEvidence(page, 'HU-40', 'HU-40-inventario-paginado.png');

  // El PDF lleva los 28.
  await page.getByRole('button', { name: /Descargar reporte de inventario en PDF/ }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Vista previa: Reporte de inventario' })
      .getByRole('table', { name: 'Stock de productos' })
      .locator('tbody tr'),
  ).toHaveCount(28);
});
