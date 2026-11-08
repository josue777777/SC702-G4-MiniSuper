import { expect, test, type Page } from '@playwright/test';
import { insertUser, withDb } from '../support/db';
import { BACKEND_URL } from '../support/env';
import { saveEvidence } from '../support/evidence';
import { resetCatalog, seedProducts, signInAsOwner, stockOf } from '../support/fixtures';
import { readHistory } from '../support/kardex';
import { BODEGA, openAs } from '../support/reports';

/**
 * HU-38 desde Movimientos · Kardex: la entrada de mercadería se registra en el
 * kardex del producto, con pedido (PED-xxxx precarga proveedor, lo que falta
 * y el costo; el pedido queda recibido o parcial) o sin pedido (compra
 * directa con factura, proveedor, fecha, cantidad, costo y lotes). Sin
 * referencia o con 0 unidades no se guarda. También el egreso: una salida que
 * no es venta (vencido, traslado, devolución a proveedor) del lote elegido.
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

function entryPanel(page: Page) {
  return page.getByRole('region', { name: 'Registrar ingreso' });
}

function exitPanel(page: Page) {
  return page.getByRole('region', { name: 'Registrar egreso' });
}

test('ingreso con pedido: PED-0001 precarga proveedor, lo que falta y el costo; el pedido queda parcial', async ({
  page,
}) => {
  await orderRice(page);
  await page.goto(`/movimientos?productId=${await productId('ARR-01')}`);
  await page.getByRole('button', { name: '+ Registrar ingreso' }).click();

  const panel = entryPanel(page);

  await panel.getByLabel('N.º pedido (si viene de uno)').fill('PED-0001');
  await panel.getByRole('button', { name: 'Cargar pedido' }).click();

  // Se precargan el proveedor, lo que falta y el costo acordado del pedido.
  await expect(panel.getByLabel('Proveedor')).toHaveValue('Distribuidora Central');
  await expect(panel.getByLabel('Cantidad (faltan 10)')).toHaveValue('10');
  await expect(panel.getByLabel('Costo unit.')).toHaveValue('980.00');

  // Llegaron 6 de los 10, con la factura F-700.
  await panel.getByLabel('Cantidad (faltan 10)').fill('6');
  await panel.getByLabel('N.º factura').fill('F-700');
  await expect(panel.getByRole('status')).toContainText('Saldo: 40 → 46');
  await saveEvidence(page, 'HU-38', 'movimientos-ingreso-con-pedido.png', { fullPage: true });
  await panel.getByRole('button', { name: 'Guardar ingreso' }).click();

  await expect(
    page.getByRole('status').filter({ hasText: 'Ingreso registrado: +6' }),
  ).toBeVisible();
  expect(await stockOf('ARR-01')).toBe(46);
  expect((await readHistory(page))[0]?.slice(1, 6)).toEqual([
    'Recepción PED-0001',
    'F-700',
    '6',
    '—',
    '46',
  ]);

  // El pedido quedó parcial: faltan 4.
  const status = await withDb(async (client) => {
    const result = await client.query<{ status: string }>(
      `SELECT status FROM "PurchaseOrder" WHERE number = 1`,
    );

    return result.rows[0]?.status;
  });

  expect(status).toBe('PARTIAL');
});

test('ingreso sin pedido: sin referencia o con 0 no se guarda; una compra directa entra con sus lotes', async ({
  page,
}) => {
  await page.goto(`/movimientos?productId=${await productId('ACE-12')}`);
  await page.getByRole('button', { name: '+ Registrar ingreso' }).click();

  const panel = entryPanel(page);

  // Sin referencia (factura) no se guarda.
  await panel.getByRole('button', { name: 'Guardar ingreso' }).click();
  await expect(panel.getByRole('alert')).toHaveText(
    'Indique el número de factura (la referencia del ingreso).',
  );

  // Con 0 unidades tampoco.
  await panel.getByLabel('N.º factura').fill('45991');
  await panel.getByLabel('Proveedor').selectOption({ label: 'Distribuidora Central' });
  await panel.getByLabel('Cantidad').fill('0');
  await panel.getByRole('button', { name: 'Guardar ingreso' }).click();
  await expect(panel.getByRole('alert')).toHaveText('La cantidad debe ser mayor que 0.');

  // 12 aceites en dos lotes con su fecha de vencimiento.
  await panel.getByLabel('Cantidad').fill('12');
  await panel.getByLabel('Lote 1', { exact: true }).fill('L-2411A');
  await panel.getByLabel('Vence el lote 1').fill(inDays(120));
  await panel.getByLabel('Unidades del lote 1').fill('8');
  await panel.getByRole('button', { name: '+ Agregar lote' }).click();
  await expect(panel.getByLabel('Unidades del lote 2')).toHaveValue('4');
  await panel.getByLabel('Lote 2', { exact: true }).fill('L-2411B');
  await panel.getByLabel('Vence el lote 2').fill(inDays(170));
  await expect(panel.getByLabel('Suma de los lotes')).toHaveText('12 / 12');
  await expect(panel.getByRole('status')).toContainText('Saldo: 18 → 30');
  await expect(panel.getByRole('status')).toContainText('₡58');
  await saveEvidence(page, 'HU-38', 'movimientos-ingreso-compra-directa.png', { fullPage: true });
  await panel.getByRole('button', { name: 'Guardar ingreso' }).click();

  await expect(
    page.getByRole('status').filter({ hasText: 'Ingreso registrado: +12' }),
  ).toBeVisible();
  expect(await stockOf('ACE-12')).toBe(30);
  expect((await readHistory(page))[0]?.slice(1)).toEqual([
    'Compra directa',
    '45991',
    '12',
    '—',
    '30',
    '2 lotes',
  ]);

  // La ficha se actualiza sin recargar: existencias y el resumen.
  const sheet = page.getByRole('region', { name: 'Ficha de Aceite vegetal grande' });

  await expect(sheet.getByLabel('Stock actual')).toHaveText('30');
});

test('egreso: «Vencido / descartado» sale del lote elegido y el filtro «Salidas» lo suma', async ({
  page,
}) => {
  await page.goto(`/movimientos?productId=${await productId('ACE-12')}`);
  await page.getByRole('button', { name: '− Registrar egreso' }).click();

  const panel = exitPanel(page);

  // El stock que había quedó en el lote «SIN LOTE».
  await panel.getByLabel('Lote').selectOption({ label: 'SIN LOTE · no vence · 18 disp.' });
  await panel.getByLabel('N.º documento').fill('44');
  await panel.getByLabel('Cantidad').fill('99');
  await panel.getByRole('button', { name: 'Guardar egreso' }).click();
  await expect(panel.getByRole('alert')).toHaveText(
    'Del lote SIN LOTE quedan 18: no puede salir más.',
  );

  await panel.getByLabel('Cantidad').fill('4');
  await panel.getByLabel('Detalle (opcional)').fill('botellas vencidas retiradas de la góndola');
  await expect(panel.getByRole('status')).toContainText('Saldo: 18 → 14');
  await saveEvidence(page, 'HU-38', 'movimientos-egreso.png', { fullPage: true });
  await panel.getByRole('button', { name: 'Guardar egreso' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Egreso registrado: −4' })).toBeVisible();
  expect(await stockOf('ACE-12')).toBe(14);
  expect((await readHistory(page))[0]?.slice(1)).toEqual([
    'Vencido / descartado',
    '44',
    '—',
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
  await expect(table.locator('tfoot')).toHaveText(/Totales\s*\+0\s*−4\s*14/);
  await saveEvidence(page, 'HU-38', 'movimientos-filtro-salidas.png', { fullPage: true });
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
  await expect(cell('Existencias')).toContainText('Sobre el máximo');
  await saveEvidence(page, 'HU-38', 'movimientos-ficha.png', { fullPage: true });
});

test('la Bodega registra ingresos y egresos', async ({ browser }) => {
  await insertUser(BODEGA);

  const bodega = await openAs(browser, BODEGA);

  await bodega.page.goto(`/movimientos?productId=${await productId('ARR-01')}`);
  await expect(bodega.page.getByRole('button', { name: '+ Registrar ingreso' })).toBeEnabled();
  await expect(bodega.page.getByRole('button', { name: '− Registrar egreso' })).toBeEnabled();
  await bodega.context.close();
});
