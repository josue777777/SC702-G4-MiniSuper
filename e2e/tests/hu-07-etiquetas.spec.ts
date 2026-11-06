import { expect, test, type Frame, type Page } from '@playwright/test';
import { insertUser, withDb } from '../support/db';
import { BACKEND_URL } from '../support/env';
import { saveEvidence } from '../support/evidence';
import {
  E2E_OWNER,
  ensureOwner,
  resetCatalog,
  seedProducts,
  signInAsOwner,
  signInVia,
} from '../support/fixtures';

/**
 * HU-07 — Etiquetas de productos con el diseño del negocio (rollo térmico u hoja
 * carta), que define el Encargado. La ventana trabaja con lo que se eligió antes:
 *   - botón «Etiquetas» de arriba (nada elegido): buscar en el catálogo, varios;
 *   - «🏷 Etiqueta» de la barra (un producto marcado): solo las copias de ese;
 *   - «Ver pedido»: solo los productos del pedido.
 * El código de barras y el QR se ven, se generan y se reemplazan en «Modificar».
 *
 * La impresión real no se puede ver en una prueba: se cuenta cuántas veces se
 * pidió imprimir y se revisan las páginas que se mandaron a la impresora (el
 * marco escondido `#label-print-frame`).
 */

const BUSINESS = 'Abastecedor Nuevo Amanecer';

test.beforeEach(async ({ page }) => {
  await resetCatalog();
  await signInAsOwner(page);
  await seedProducts([
    {
      code: 'ARR-01',
      name: 'Arroz blanco 1 kg',
      category: 'Granos',
      price: '1350.00',
      cost: '980.00',
      stock: 40,
      supplier: 'Distribuidora Central',
      barcode: '7501234567893',
    },
    {
      code: 'CAF-01',
      name: 'Café molido 500 g',
      category: 'Abarrotes',
      price: '4200.00',
      cost: '3100.00',
      stock: 18,
      supplier: 'Distribuidora Central',
      barcode: '7501000000012',
    },
    {
      code: 'PAN-01',
      name: 'Pan cuadrado',
      category: 'Panadería',
      price: '1800.00',
      cost: '1250.00',
      stock: 6,
      supplier: null,
    },
  ]);
  // Cuenta las impresiones de la página y del marco escondido de las etiquetas.
  await page.addInitScript(() => {
    const top = window.top as unknown as { __labelPrints?: number };

    top.__labelPrints ??= 0;
    window.print = () => {
      top.__labelPrints = (top.__labelPrints ?? 0) + 1;
    };
  });
});

function labelsDialog(page: Page) {
  return page.getByRole('dialog', { name: /Imprimir etiquetas/ });
}

async function openLabels(page: Page): Promise<void> {
  await page.goto('/inventory');
  await page.getByRole('button', { name: '🏷 Etiquetas' }).click();
  await expect(
    labelsDialog(page).getByRole('table', { name: 'Productos a etiquetar' }),
  ).toBeVisible();
}

/** Espera la impresión y devuelve el marco con las páginas que se mandaron a la impresora. */
async function printedFrame(page: Page): Promise<Frame> {
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __labelPrints?: number }).__labelPrints),
    )
    .toBe(1);
  const frame = await (await page.locator('#label-print-frame').elementHandle())?.contentFrame();

  if (frame === null || frame === undefined) {
    throw new Error('No se armó el marco de impresión de las etiquetas.');
  }

  return frame;
}

test('sin producto marcado las acciones se ven apagadas; con uno, «Etiqueta» es solo de él', async ({
  page,
}) => {
  await page.goto('/inventory');

  for (const action of [/Modificar/, /Desactivar/, /Etiqueta$/, /Ver movimientos/]) {
    await expect(page.getByRole('button', { name: action })).toBeDisabled();
  }
  await expect(page.getByRole('button', { name: '+ Crear' })).toBeEnabled();

  await page.getByRole('row', { name: /ARR-01/ }).click();
  await expect(page.getByRole('button', { name: /Modificar/ })).toBeEnabled();
  await page.getByRole('button', { name: '🏷 Etiqueta', exact: true }).click();

  // Ya se eligió el producto: la ventana es solo de él, sin buscar en el catálogo.
  const dialog = page.getByRole('dialog', { name: 'Imprimir etiqueta · Arroz blanco 1 kg' });

  await expect(dialog.getByLabel('Cantidad de etiquetas')).toHaveValue('1');
  await expect(dialog.getByRole('searchbox')).toHaveCount(0);
  await expect(dialog.getByRole('table', { name: 'Productos a etiquetar' })).toHaveCount(0);
  await expect(dialog.getByLabel('Vista previa de la etiqueta')).toContainText(BUSINESS);
  await expect(dialog.getByLabel('Vista previa de la etiqueta')).toContainText(/1\s350,00/);

  await dialog.getByLabel('Cantidad de etiquetas').fill('4');
  await expect(dialog.getByLabel('Resumen de la impresión')).toContainText('Etiquetas4');
  await saveEvidence(page, 'HU-07', 'HU-07-imprimir-etiqueta-de-un-producto.png');
  await dialog.getByRole('button', { name: '🖨 Imprimir 4 etiquetas' }).click();

  const frame = await printedFrame(page);

  await expect(frame.locator('.product-label')).toHaveCount(4);
  await expect(frame.locator('.product-label').last()).toContainText('Arroz blanco 1 kg');
});

test('«Modificar» › Etiquetas muestra el código de barras y el QR, y avisa antes de reemplazar', async ({
  page,
}) => {
  await page.goto('/inventory');
  await page.getByRole('row', { name: /ARR-01/ }).dblclick();

  const form = page.getByRole('dialog', { name: 'Modificar producto' });

  await form.getByRole('tab', { name: 'Etiquetas' }).click();
  await expect(form.getByRole('img', { name: 'Código de barras 7501234567893' })).toBeVisible();
  await expect(form.getByRole('button', { name: 'Descargar código QR' })).toBeVisible();

  await form.getByRole('button', { name: 'Reemplazar código' }).click();
  await expect(form.getByRole('alert')).toContainText('ya no servirán');
  await saveEvidence(page, 'HU-07', 'HU-07-reemplazar-codigo-en-modificar.png');
  await form.getByRole('button', { name: 'Sí, reemplazar código' }).click();

  await expect(form.getByRole('img', { name: 'Código de barras 7501234567893' })).toHaveCount(0);
  await expect(form.getByText('Se guardará al guardar el producto.')).toBeVisible();
});

test('el botón «Etiquetas» busca en todo el catálogo y abre sin nada elegido', async ({ page }) => {
  await page.goto('/inventory');
  // Aunque haya un producto seleccionado en la tabla, este botón es para varios.
  await page.getByRole('row', { name: /ARR-01/ }).click();
  await page.getByRole('button', { name: '🏷 Etiquetas' }).click();

  const dialog = labelsDialog(page);

  await expect(dialog.getByLabel('Etiquetas de Arroz blanco 1 kg')).toHaveValue('0');
  await expect(dialog.getByRole('button', { name: '🖨 Imprimir 0 etiquetas' })).toBeDisabled();

  await dialog.getByLabel('Buscar producto para etiquetar').fill('café');
  await expect(dialog.getByLabel('Etiquetas de Café molido 500 g')).toBeVisible();
  await expect(dialog.getByLabel('Etiquetas de Arroz blanco 1 kg')).toHaveCount(0);
});

test('varios productos en rollo: una página por etiqueta, con negocio, precio y códigos', async ({
  page,
}) => {
  await openLabels(page);
  const dialog = labelsDialog(page);

  await dialog.getByLabel('Etiquetas de Arroz blanco 1 kg').fill('3');
  await dialog.getByLabel('Etiquetas de Pan cuadrado').fill('2');

  const summary = dialog.getByLabel('Resumen de la impresión');

  await expect(summary).toContainText('Etiquetas5');
  await expect(summary).toContainText('Stickers del rollo5');
  await expect(dialog.getByText(/Un producto no tiene código de barras/)).toBeVisible();
  await saveEvidence(page, 'HU-07', 'HU-07-imprimir-etiquetas-rollo.png');

  await dialog.getByRole('button', { name: '🖨 Imprimir 5 etiquetas' }).click();

  const frame = await printedFrame(page);

  await expect(frame.locator('.label-page')).toHaveCount(5);
  await expect(frame.locator('.product-label').first()).toContainText(BUSINESS);
  await expect(frame.locator('.product-label').first()).toContainText('Arroz blanco 1 kg');
  await expect(frame.locator('.product-label').first()).toContainText(/1\s350,00/);
  // El pan no tiene código de barras: su etiqueta lleva el QR, pero no barras.
  await expect(frame.locator('.product-label').nth(4)).toContainText('Pan cuadrado');
  await expect(
    frame
      .locator('.product-label')
      .nth(4)
      .getByRole('img', { name: /Código de barras/ }),
  ).toHaveCount(0);
  expect(await frame.evaluate(() => document.head.innerHTML)).toContain('size:58mm 40mm');
});

test('el Encargado personaliza: hoja carta de 30 sin precio, y vale para todo el negocio', async ({
  page,
}) => {
  await openLabels(page);
  const dialog = labelsDialog(page);

  await dialog.getByRole('button', { name: 'Personalizar' }).click();

  const customize = page.getByRole('dialog', { name: 'Personalizar etiqueta' });

  await customize.getByLabel('Hoja carta · 30 por hoja (66,7 × 25,4 mm)').check();
  await customize.getByRole('switch', { name: 'Precio de venta' }).uncheck();
  await expect(customize.getByLabel('Vista previa de la etiqueta')).not.toContainText(/1\s350,00/);
  await saveEvidence(page, 'HU-07', 'HU-07-personalizar-etiqueta.png');
  await customize.getByRole('button', { name: 'Guardar diseño' }).click();
  await expect(customize).toBeHidden();
  await expect(dialog).toContainText('Hoja carta · 30 por hoja');

  // 32 etiquetas desde la posición 5: 26 en la primera hoja y 6 en la segunda.
  await dialog.getByLabel('Etiquetas de Arroz blanco 1 kg').fill('32');
  await dialog.getByLabel('Empezar en la etiqueta').fill('5');
  await expect(dialog.getByLabel('Resumen de la impresión')).toContainText('Hojas carta2');
  await dialog.getByRole('button', { name: '🖨 Imprimir 32 etiquetas' }).click();

  const frame = await printedFrame(page);

  await expect(frame.locator('.label-page')).toHaveCount(2);
  await expect(frame.locator('.label-page').first().locator('.product-label')).toHaveCount(26);
  await expect(frame.locator('.label-page').nth(1).locator('.product-label')).toHaveCount(6);
  await expect(frame.locator('.product-label').first()).not.toContainText(/1\s350,00/);

  const saved = await page.request.get(`${BACKEND_URL}/api/business/label-design`);
  const design = ((await saved.json()) as { data: { size: string; show: { price: boolean } } })
    .data;

  expect(design.size).toBe('letter-30');
  expect(design.show.price).toBe(false);
});

test('no deja guardar una etiqueta que no dice qué producto es', async ({ page }) => {
  await openLabels(page);
  await labelsDialog(page).getByRole('button', { name: 'Personalizar' }).click();

  const customize = page.getByRole('dialog', { name: 'Personalizar etiqueta' });

  for (const field of [
    'Nombre del producto',
    'Código del producto',
    'Código de barras',
    'Código QR',
  ]) {
    await customize.getByRole('switch', { name: field }).uncheck();
  }

  await expect(customize.getByRole('alert')).toContainText('Muestre al menos el nombre');
  await expect(customize.getByRole('button', { name: 'Guardar diseño' })).toBeDisabled();
});

test('desde un pedido: una etiqueta por unidad pedida', async ({ page }) => {
  const supplierId = await withDb(async (client) => {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM "Supplier" WHERE name = 'Distribuidora Central'`,
    );

    return result.rows[0]?.id ?? '';
  });
  const ids = await withDb(async (client) => {
    const result = await client.query<{ id: string; code: string }>(
      `SELECT id, code FROM "Product" WHERE code IN ('ARR-01', 'CAF-01')`,
    );

    return Object.fromEntries(result.rows.map((row) => [row.code, row.id]));
  });
  const created = await page.request.post(`${BACKEND_URL}/api/purchase-orders`, {
    data: {
      supplierId,
      items: [
        { productId: ids['ARR-01'], quantity: 4 },
        { productId: ids['CAF-01'], quantity: 2 },
      ],
    },
  });

  expect(created.status()).toBe(201);

  await page.goto('/orders');
  await page.getByRole('button', { name: 'Ver pedido' }).first().click();
  await page.getByRole('button', { name: '🏷 Etiquetas' }).click();

  const dialog = page.getByRole('dialog', { name: /Imprimir etiquetas · pedido PED-/ });

  await expect(dialog.getByLabel('Etiquetas de Arroz blanco 1 kg')).toHaveValue('4');
  await expect(dialog.getByLabel('Etiquetas de Café molido 500 g')).toHaveValue('2');
  // Solo lo del pedido: el pan no se pidió y no se busca en el catálogo.
  await expect(dialog.getByLabel('Etiquetas de Pan cuadrado')).toHaveCount(0);
  await expect(dialog.getByRole('searchbox')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '🖨 Imprimir 6 etiquetas' })).toBeEnabled();
});

test('el Cajero imprime con el diseño del negocio, pero no puede cambiarlo', async ({ page }) => {
  await ensureOwner();
  await insertUser({
    name: 'Cajero de Prueba',
    email: 'cajero.prueba@example.com',
    password: E2E_OWNER.password,
    role: 'CAJERO',
  });
  await page.context().clearCookies();
  await signInVia(page.request, {
    email: 'cajero.prueba@example.com',
    password: E2E_OWNER.password,
  });

  await openLabels(page);
  const dialog = labelsDialog(page);

  await expect(dialog).toContainText('Lo define el Encargado.');
  await expect(dialog.getByRole('button', { name: 'Personalizar' })).toHaveCount(0);

  const denied = await page.request.put(`${BACKEND_URL}/api/business/label-design`, {
    data: { size: 'roll-50x25', show: { productName: true } },
    headers: { Origin: 'http://localhost:5183' },
  });

  expect(denied.status()).toBe(403);
});
