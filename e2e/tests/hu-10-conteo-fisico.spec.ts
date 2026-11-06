import { expect, test, type Page } from '@playwright/test';
import { insertUser } from '../support/db';
import { saveEvidence } from '../support/evidence';
import { resetCatalog, seedProducts, signInAsOwner, stockOf } from '../support/fixtures';
import { BODEGA, consult, openAs, readTable, tile, tileCents } from '../support/reports';

/**
 * HU-10 — Conteo físico. La ventana solo sirve para contar: el producto se
 * BUSCA (por nombre, código o con el lector), nunca se elige de una lista con
 * todo el catálogo, y dentro de la ventana nada se despliega
 * (docs/PANTALLAS.md, regla 4). Los conteos ya hechos se revisan en
 * Reportes › Conteos, con período, totales y descarga, igual que los demás
 * reportes.
 */

test.beforeEach(async ({ page }) => {
  await signInAsOwner(page);
  await resetCatalog();
  await seedProducts([
    {
      code: 'ARR-01',
      name: 'Arroz blanco 1 kg',
      category: 'Granos',
      price: '1350.00',
      cost: '980.00',
      stock: 40,
      supplier: null,
      barcode: '7501234567893',
    },
    {
      code: 'CAF-01',
      name: 'Café molido 500 g',
      category: 'Abarrotes',
      price: '4200.00',
      cost: '3100.00',
      stock: 18,
      supplier: null,
      barcode: '7501000000012',
    },
  ]);
});

function countDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Conteo físico' });
}

async function openCount(page: Page): Promise<void> {
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Conteo físico' }).click();
  await expect(countDialog(page)).toBeVisible();
}

/** Escribe lo contado y confirma; espera el aviso de que quedó registrado. */
async function confirmCount(page: Page, counted: string): Promise<void> {
  const dialog = countDialog(page);

  await dialog.getByLabel('Cantidad contada').fill(counted);
  await dialog.getByRole('button', { name: 'Confirmar conteo' }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Conteo registrado' })).toBeVisible();
}

test('se busca el producto (o se escanea), se cuenta y nada se despliega en la ventana', async ({
  page,
}) => {
  await openCount(page);

  const dialog = countDialog(page);
  const search = dialog.getByRole('searchbox', { name: 'Buscar producto para contar' });

  // Ni una lista con todo el catálogo ni secciones plegadas dentro de la ventana.
  await expect(dialog.getByRole('combobox')).toHaveCount(0);
  await expect(dialog.locator('details')).toHaveCount(0);

  // Buscar por nombre y elegir el resultado.
  await search.fill('arroz');
  await dialog
    .getByRole('list', { name: 'Productos encontrados' })
    .getByRole('button', { name: /ARR-01/ })
    .click();
  await expect(dialog.getByLabel('Producto', { exact: true })).toHaveValue(
    'ARR-01 — Arroz blanco 1 kg',
  );
  await expect(dialog.getByLabel('Stock en el sistema')).toHaveValue('40');
  await dialog.getByLabel('Cantidad contada').fill('37');
  await expect(dialog.getByLabel('Diferencia')).toHaveValue(/-3/);
  await saveEvidence(page, 'HU-10', 'conteo-fisico-buscador.png');
  await confirmCount(page, '37');
  expect(await stockOf('ARR-01')).toBe(37);

  // Con el lector: el código de barras + Enter en el buscador elige el producto.
  await dialog.getByRole('button', { name: 'Cambiar producto' }).click();
  await search.fill('7501000000012');
  await search.press('Enter');
  await expect(dialog.getByLabel('Producto', { exact: true })).toHaveValue(
    'CAF-01 — Café molido 500 g',
  );
  await confirmCount(page, '20');
  expect(await stockOf('CAF-01')).toBe(20);

  // El historial es otra tarea: la ventana enlaza a Reportes › Conteos.
  await dialog.getByRole('link', { name: 'Reportes › Conteos' }).click();
  await expect(page.getByRole('tab', { name: 'Conteos', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await consult(page);

  // −3 × ₡980 + 2 × ₡3 100 = ₡3 260
  expect(await tileCents(page, 'Valor de la diferencia')).toBe(326_000);
  expect(await tile(page, 'Conteos')).toBe('2');
  expect(await tile(page, 'Unidades faltantes')).toBe('3');
  expect(await tile(page, 'Unidades sobrantes')).toBe('2');

  const table = await readTable(page, 'Reporte de conteos físicos');

  expect(table.headers).toEqual([
    'Fecha y hora',
    'Código',
    'Producto',
    'Categoría',
    'Sistema',
    'Contado',
    'Diferencia',
    'Valor',
  ]);
  // El más reciente primero.
  expect(table.rows.map((row) => row.slice(1, 7))).toEqual([
    ['CAF-01', 'Café molido 500 g', 'Abarrotes', '18', '20', '2'],
    ['ARR-01', 'Arroz blanco 1 kg', 'Granos', '40', '37', '-3'],
  ]);
  await saveEvidence(page, 'HU-10', 'reporte-conteos.png', { fullPage: true });
});

test('la Bodega ve el reporte de conteos; los reportes de dinero no', async ({ browser }) => {
  await insertUser(BODEGA);

  const bodega = await openAs(browser, BODEGA);

  await bodega.page.goto('/reports');
  await expect(bodega.page.getByRole('tab', { name: 'Conteos', exact: true })).toBeVisible();
  await expect(bodega.page.getByRole('tab', { name: 'Ventas', exact: true })).toHaveCount(0);
  await bodega.page.getByRole('tab', { name: 'Conteos', exact: true }).click();
  await consult(bodega.page);
  await expect(bodega.page.getByText('No hubo conteos físicos en el período.')).toBeVisible();
  await bodega.context.close();
});
