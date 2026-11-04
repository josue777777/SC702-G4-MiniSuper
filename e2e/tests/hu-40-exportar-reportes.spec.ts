import { expect, test } from '@playwright/test';
import { saveEvidence } from '../support/evidence';
import { resetCatalog, signInAsOwner } from '../support/fixtures';
import {
  PERIOD,
  consult,
  openReport,
  readDownload,
  readTable,
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

  // PDF del inventario.
  await page.getByRole('button', { name: /Descargar reporte de inventario en PDF/ }).click();
  await expect(
    page.getByRole('dialog', { name: 'Vista previa: Reporte de inventario' }),
  ).toContainText('Productos activos');
});
