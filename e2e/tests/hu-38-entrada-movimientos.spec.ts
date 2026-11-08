import { expect, test, type Page } from '@playwright/test';
import { insertUser, withDb } from '../support/db';
import { BACKEND_URL } from '../support/env';
import { saveEvidence } from '../support/evidence';
import { resetCatalog, seedProducts, signInAsOwner, stockOf } from '../support/fixtures';
import { readHistory } from '../support/kardex';
import { BODEGA, openAs } from '../support/reports';

/**
 * HU-38 desde Movimientos: la entrada de mercadería se registra allí, cada
 * acción en su ventana, con el diseño de todo el sistema.
 *
 * - «📦 Carga de pedido»: un pedido COMPLETO (PED-xxxx, todos sus productos a
 *   la vez); el pedido queda recibido o parcial. Pedidos › «Registrar
 *   entrega» llega a esta misma ventana con el pedido ya elegido.
 * - «+ Ingreso»: UN producto sin pedido (compra directa con factura,
 *   proveedor, fecha, cantidad, costo y lotes). Sin referencia o con 0
 *   unidades no se guarda.
 * - «− Egreso»: una salida que no es venta (vencido, traslado, devolución a
 *   proveedor) del lote elegido.
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
      supplier: 'Distribuidora Central',
    },
    {
      code: 'ACE-12',
      name: 'Aceite vegetal grande',
      category: 'Abarrotes',
      price: '6500.00',
      cost: '4850.00',
      stock: 18,
      supplier: 'Distribuidora Central',
      perishable: true,
    },
  ]);
});

/** Id de un producto sembrado. */
async function productId(code: string): Promise<string> {
  return withDb(async (client) => {
    const result = await client.query<{ id: string }>(`SELECT id FROM "Product" WHERE code = $1`, [
      code,
    ]);

    return result.rows[0]?.id ?? '';
  });
}

/** Pedido de 10 arroces a Distribuidora Central (PED-0001). */
async function orderRice(page: Page): Promise<void> {
  const supplierId = await withDb(async (client) => {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM "Supplier" WHERE name = 'Distribuidora Central'`,
    );

    return result.rows[0]?.id ?? '';
  });
  const created = await page.request.post(`${BACKEND_URL}/api/purchase-orders`, {
    data: { supplierId, items: [{ productId: await productId('ARR-01'), quantity: 10 }] },
  });

  expect(created.status()).toBe(201);
}

/** Día de hoy en Costa Rica más `days` días, `YYYY-MM-DD`. */
function inDays(days: number): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
  const date = new Date(`${today}T12:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function entryDialog(page: Page) {
  return page.getByRole('dialog', { name: /^Ingreso · / });
}

function exitDialog(page: Page) {
  return page.getByRole('dialog', { name: /^Egreso · / });
}

test('carga de pedido: se elige PED-0001 entre los pendientes y entran todos sus productos; el pedido queda parcial', async ({
  page,
}) => {
  await orderRice(page);
  await page.goto('/movimientos');
  await page.getByRole('button', { name: '📦 Carga de pedido' }).click();

  const picker = page.getByRole('dialog', { name: 'Carga de pedido' });
  const pending = picker.getByRole('table', { name: 'Pedidos pendientes' });

  // Se busca por número de pedido, proveedor o producto.
  await picker.getByRole('searchbox').fill('arroz');
  await expect(pending.locator('tbody tr')).toHaveCount(1);
  await expect(pending).toContainText('PED-0001');
  await saveEvidence(page, 'HU-38', 'movimientos-carga-de-pedido.png');
  await pending.getByRole('button', { name: 'Cargar PED-0001' }).click();

  // La misma ventana de la entrega: factura, lo que llegó y sus lotes.
  const receipt = page.getByRole('dialog', { name: 'Registrar entrega · PED-0001' });

  await receipt.getByLabel('N.º de factura').fill('F-700');
  await receipt.getByLabel('Llegó de Arroz blanco 1 kg').fill('6');
  await receipt.getByRole('button', { name: 'Registrar y cargar al inventario' }).click();
  await expect(receipt).toHaveCount(0);

  await expect(
    page.getByRole('status').filter({
      hasText: 'Entrega F-700 del pedido PED-0001 cargada al inventario.',
    }),
  ).toBeVisible();
  expect(await stockOf('ARR-01')).toBe(46);

  // En los movimientos recientes se ve la entrada, con la factura como documento.
  await expect(
    page.getByRole('table', { name: 'Movimientos recientes de todos los productos' }),
  ).toContainText('Recepción PED-0001');

  const status = await withDb(async (client) => {
    const result = await client.query<{ status: string }>(
      `SELECT status FROM "PurchaseOrder" WHERE number = 1`,
    );

    return result.rows[0]?.status;
  });

  expect(status).toBe('PARTIAL');
});

test('desde Pedidos, «Registrar entrega» lleva a la carga de ese pedido en Movimientos', async ({
  page,
}) => {
  await orderRice(page);
  await page.goto('/orders');
  await page.getByRole('button', { name: 'Ver pedido PED-0001' }).click();
  await page
    .getByRole('dialog', { name: /^Pedido PED-0001/ })
    .getByRole('link', { name: '📦 Registrar entrega' })
    .click();

  await expect(page).toHaveURL(/\/movimientos\?pedido=/);
  await expect(page.getByRole('heading', { level: 1, name: 'Movimientos' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Registrar entrega · PED-0001' })).toBeVisible();
  await saveEvidence(page, 'HU-38', 'pedidos-a-movimientos.png');

  // Cancelar cierra la ventana y quita el pedido de la dirección.
  await page
    .getByRole('dialog', { name: 'Registrar entrega · PED-0001' })
    .getByRole('button', { name: 'Cancelar' })
    .click();
  await expect(page).toHaveURL(/\/movimientos$/);
});

test('ingreso sin pedido: sin referencia o con 0 no se guarda; una compra directa entra con sus lotes', async ({
  page,
}) => {
  await page.goto(`/movimientos?productId=${await productId('ACE-12')}`);
  await page.getByRole('button', { name: '+ Ingreso' }).click();

  const dialog = entryDialog(page);

  // Sin referencia (factura) no se guarda.
  await dialog.getByRole('button', { name: 'Guardar ingreso' }).click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'Indique el número de factura (la referencia del ingreso).',
  );

  // Con 0 unidades tampoco.
  await dialog.getByLabel('N.º factura').fill('45991');
  await dialog.getByLabel('Proveedor').selectOption({ label: 'Distribuidora Central' });
  await dialog.getByLabel('Cantidad').fill('0');
  await dialog.getByRole('button', { name: 'Guardar ingreso' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('La cantidad debe ser mayor que 0.');

  // 12 aceites en dos lotes con su fecha de vencimiento.
  await dialog.getByLabel('Cantidad').fill('12');
  await dialog.getByLabel('Lote 1', { exact: true }).fill('L-2411A');
  await dialog.getByLabel('Vence el lote 1').fill(inDays(120));
  await dialog.getByLabel('Unidades del lote 1').fill('8');
  await dialog.getByRole('button', { name: '+ Agregar lote' }).click();
  // El lote nuevo va arriba con lo que falta para cuadrar.
  await expect(dialog.getByLabel('Unidades del lote 1')).toHaveValue('4');
  await dialog.getByLabel('Lote 1', { exact: true }).fill('L-2411B');
  await dialog.getByLabel('Vence el lote 1').fill(inDays(170));
  await expect(dialog.getByLabel('Suma de los lotes')).toHaveText('Los lotes suman 12 de 12.');
  await expect(dialog.getByRole('status')).toContainText('Stock: 18 → 30');
  await expect(dialog.getByRole('status')).toContainText('₡58');
  await saveEvidence(page, 'HU-38', 'movimientos-ingreso-compra-directa.png');
  await dialog.getByRole('button', { name: 'Guardar ingreso' }).click();
  await expect(dialog).toHaveCount(0);

  await expect(
    page.getByRole('status').filter({ hasText: 'Ingreso registrado: +12' }),
  ).toBeVisible();
  expect(await stockOf('ACE-12')).toBe(30);
  expect((await readHistory(page))[0]?.slice(1)).toEqual([
    'Compra directa',
    '45991',
    '12',
    '0',
    '30',
    '2 lotes',
  ]);

  // La ficha se actualiza sin recargar.
  const sheet = page.getByRole('region', { name: 'Ficha de Aceite vegetal grande' });

  await expect(sheet.getByLabel('Stock actual')).toHaveText('30');
});

test('egreso: «Vencido / descartado» sale del lote elegido y el filtro «Salidas» lo suma', async ({
  page,
}) => {
  await page.goto(`/movimientos?productId=${await productId('ACE-12')}`);
  await page.getByRole('button', { name: '− Egreso' }).click();

  const dialog = exitDialog(page);

  // El stock que había quedó en el lote «SIN LOTE».
  await dialog.getByLabel('Lote').selectOption({ label: 'SIN LOTE · no vence · 18 disp.' });
  await dialog.getByLabel('N.º documento').fill('44');
  await dialog.getByLabel('Cantidad').fill('99');
  await dialog.getByRole('button', { name: 'Guardar egreso' }).click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'Del lote SIN LOTE quedan 18: no puede salir más.',
  );

  await dialog.getByLabel('Cantidad').fill('4');
  await dialog.getByLabel('Detalle (opcional)').fill('botellas vencidas retiradas de la góndola');
  await expect(dialog.getByRole('status')).toContainText('Stock: 18 → 14');
  await saveEvidence(page, 'HU-38', 'movimientos-egreso.png');
  await dialog.getByRole('button', { name: 'Guardar egreso' }).click();
  await expect(dialog).toHaveCount(0);

  await expect(page.getByRole('status').filter({ hasText: 'Egreso registrado: −4' })).toBeVisible();
  expect(await stockOf('ACE-12')).toBe(14);
  expect((await readHistory(page))[0]?.slice(1)).toEqual([
    'Vencido / descartado',
    '44',
    '0',
    '4',
    '14',
    '1 lote',
  ]);

  // «Salidas»: solo el egreso, con la fila «Totales».
  await page
    .getByRole('group', { name: 'Movimientos a mostrar' })
    .getByRole('button', { name: 'Salidas', exact: true })
    .click();

  const table = page.getByRole('table', { name: 'Movimientos del producto' });

  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.locator('tfoot')).toHaveText(/Totales\s*0\s*−4\s*14/);
  // Con los tonos del panel: la salida en rojo, el concepto con «−» y el lote al lado.
  const exitRow = table.locator('tbody tr').first();

  await expect(exitRow.locator('td').nth(4).locator('.text-error')).toHaveText('4');
  await expect(exitRow.locator('td').nth(1)).toContainText('−Vencido / descartado');
  await saveEvidence(page, 'HU-38', 'movimientos-filtro-salidas.png');
});

test('unidad de medida y stock máximo se guardan en el producto y se ven en la ficha', async ({
  page,
}) => {
  await page.goto('/inventory');
  await page.getByRole('row', { name: /ARR-01/ }).dblclick();

  const form = page.getByRole('dialog', { name: 'Modificar producto' });

  await form.getByRole('tab', { name: 'Existencias' }).click();
  await form.getByLabel('Unidad de medida').selectOption('KG');
  await form.getByLabel('Stock máximo (0 = sin máximo)').fill('30');
  await form.getByRole('button', { name: '✓ Guardar cambios' }).click();
  await expect(form).toHaveCount(0);

  await page.goto(`/movimientos?productId=${await productId('ARR-01')}`);

  const sheet = page.getByRole('region', { name: 'Ficha de Arroz blanco 1 kg' });
  const cell = (label: string) =>
    sheet
      .locator('dt', { hasText: new RegExp(`^${label}$`) })
      .locator('xpath=following-sibling::dd');

  await expect(cell('Unidad')).toHaveText('Kilogramo (KG)');
  await expect(cell('Stock máximo')).toHaveText('30');
  // 40 con máximo 30: el estado lo dice en palabra.
  await expect(sheet.locator('.stat-tile', { hasText: 'Existencias' })).toContainText(
    'Sobre el máximo',
  );
  await saveEvidence(page, 'HU-38', 'movimientos-ficha.png');
});

test('la Bodega registra ingresos, egresos y cargas de pedido', async ({ browser }) => {
  await insertUser(BODEGA);

  const bodega = await openAs(browser, BODEGA);

  await bodega.page.goto(`/movimientos?productId=${await productId('ARR-01')}`);
  await expect(bodega.page.getByRole('button', { name: '+ Ingreso' })).toBeEnabled();
  await expect(bodega.page.getByRole('button', { name: '− Egreso' })).toBeEnabled();
  await expect(bodega.page.getByRole('button', { name: '📦 Carga de pedido' })).toBeEnabled();
  await bodega.context.close();
});
