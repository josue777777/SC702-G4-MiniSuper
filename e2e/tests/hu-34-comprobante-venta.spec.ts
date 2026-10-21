import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { withDb } from '../support/db';
import { BACKEND_URL } from '../support/env';
import { saveEvidence } from '../support/evidence';
import {
  readSales,
  resetCatalog,
  seedCustomer,
  seedProducts,
  signInAsOwner,
} from '../support/fixtures';

/**
 * HU-34 — Generar comprobante de venta (issue #34). Navegador real + backend real
 * + PostgreSQL de pruebas. No hay impresora: `window.print` se sustituye por un
 * contador (o por un fallo) y la vista de impresión se comprueba con
 * `emulateMedia({ media: 'print' })`.
 */

const BUSINESS = 'Abastecedor Nuevo Amanecer';

test.beforeEach(async ({ page }) => {
  await signInAsOwner(page);
  await resetCatalog();
  await seedProducts([
    {
      code: 'P001',
      barcode: '7501000000011',
      name: 'Café molido 500 g',
      category: 'Bebidas',
      price: '1500.00',
      cost: '1000.00',
      stock: 10,
      supplier: null,
    },
    {
      code: 'P002',
      barcode: '7501000000028',
      name: 'Arroz 1 kg',
      category: 'Granos',
      price: '900.00',
      cost: '700.00',
      stock: 5,
      supplier: null,
    },
  ]);
  // Sin impresora: se cuenta la invocación en lugar de abrir el diálogo del sistema.
  await page.addInitScript(() => {
    (window as unknown as { __printCalls: number }).__printCalls = 0;
    window.print = () => {
      (window as unknown as { __printCalls: number }).__printCalls += 1;
    };
  });
});

async function addProduct(page: Page, code: string, name: string): Promise<void> {
  await page.getByLabel('Código de barras o código del producto').fill(code);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('table', { name: 'Productos de la venta' })).toContainText(name);
}

/** Cobra 2 cafés + 1 arroz (₡3 900) en efectivo con ₡5 000. */
async function sellInCash(page: Page): Promise<void> {
  await page.goto('/sales');
  await addProduct(page, 'P001', 'Café molido 500 g');
  await addProduct(page, 'P001', 'Café molido 500 g');
  await addProduct(page, 'P002', 'Arroz 1 kg');
  await page.getByRole('radio', { name: 'Efectivo' }).check();
  await page.getByLabel('Monto recibido').fill('5000');
  await page.getByRole('button', { name: 'Finalizar venta' }).click();
}

const receiptDialog = (page: Page) => page.getByRole('dialog', { name: 'Comprobante de venta' });
const ticket = (page: Page) =>
  receiptDialog(page).getByRole('article', { name: /Comprobante de la venta/ });

test('al confirmar la venta aparece el ticket con los datos reales guardados', async ({ page }) => {
  await sellInCash(page);

  await expect(receiptDialog(page)).toBeVisible();
  await expect(page).toHaveURL(/\/sales\?receipt=[0-9a-f-]{36}$/);

  // Lo que muestra el ticket sale de la venta persistida.
  const [sale] = await readSales();

  expect(sale).toBeDefined();
  expect(sale).toMatchObject({ paymentMethod: 'CASH', total: '3900.00', cashReceived: '5000.00' });

  const view = ticket(page);

  await expect(view).toContainText(BUSINESS);
  await expect(view).toContainText(`Venta #${sale?.number}`);
  await expect(view).toContainText(/\d{1,2}\/\d{1,2}\/\d{2},? \d{1,2}:\d{2}/);

  const cafe = view.getByRole('row', { name: /Café molido 500 g/ });
  const arroz = view.getByRole('row', { name: /Arroz 1 kg/ });

  await expect(cafe).toContainText('2');
  await expect(cafe).toContainText(/1\s500,00/); // precio unitario
  await expect(cafe).toContainText(/3\s000,00/); // subtotal
  await expect(arroz).toContainText(/900,00/);

  await expect(view.getByText('Total', { exact: true })).toBeVisible();
  await expect(view).toContainText(/3\s900,00/);
  await expect(view).toContainText('Método de pago');
  await expect(view).toContainText('Efectivo');
  await expect(view).toContainText(/5\s000,00/); // recibido
  await expect(view).toContainText(/1\s100,00/); // cambio
  await expect(view).not.toContainText('Cliente (fiado)');
  await saveEvidence(page, 'HU-34', 'HU-34-ticket-venta.png');
});

test('Imprimir invoca la impresión y la vista de impresión muestra solo el ticket', async ({
  page,
}) => {
  await sellInCash(page);
  await expect(ticket(page)).toBeVisible();

  await receiptDialog(page)
    .getByRole('button', { name: /Imprimir/ })
    .click();
  expect(
    await page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls),
  ).toBe(1);

  // Vista de impresión: la aplicación se oculta y queda únicamente el comprobante.
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#root')).toBeHidden();

  const printed = page.getByTestId('print-receipt');

  await expect(printed).toBeVisible();
  await expect(printed).toContainText(BUSINESS);
  await expect(printed).toContainText(/3\s900,00/);
  await expect(printed.getByRole('row', { name: /Café molido 500 g/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Imprimir/ })).toBeHidden();
  await saveEvidence(page, 'HU-34', 'HU-34-vista-imprimible.png');

  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('#root')).toBeVisible();
  await expect(page.getByTestId('print-receipt')).toBeHidden();
});

test('si no hay impresora, el ticket sigue disponible en pantalla', async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {
      throw new Error('No hay impresora');
    };
  });
  await sellInCash(page);

  await receiptDialog(page)
    .getByRole('button', { name: /Imprimir/ })
    .click();

  await expect(
    receiptDialog(page).getByRole('status').filter({ hasText: 'No se pudo abrir la impresión' }),
  ).toBeVisible();
  await expect(ticket(page)).toBeVisible();
  await expect(ticket(page)).toContainText(/3\s900,00/);
  await saveEvidence(page, 'HU-34', 'HU-34-sin-impresora.png');
});

test('se abre después desde el historial y un cambio de precio no altera el ticket anterior', async ({
  page,
}) => {
  await sellInCash(page);
  await expect(ticket(page)).toBeVisible();
  const url = page.url();

  // El catálogo sube de precio después de la venta.
  await withDb((client) =>
    client.query(`UPDATE "Product" SET price = '9999.00' WHERE code = 'P001'`),
  );

  await page.goto('/sales');
  await expect(receiptDialog(page)).toHaveCount(0);
  await page.getByRole('button', { name: /Ver comprobante de la venta/ }).click();

  await expect(ticket(page)).toBeVisible();
  await expect(ticket(page)).toContainText(/1\s500,00/);
  await expect(ticket(page)).not.toContainText(/9\s999/);
  await expect(ticket(page)).toContainText(/3\s900,00/);

  // Y el mismo enlace lo vuelve a abrir.
  await page.goto(url);
  await expect(ticket(page)).toContainText(/3\s900,00/);

  // Cerrar el ticket no pierde la venta: sigue en el historial.
  await receiptDialog(page).getByRole('button', { name: 'Cerrar', exact: true }).last().click();
  await expect(receiptDialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/sales$/);
  await expect(page.getByRole('table', { name: 'Historial de ventas' })).toContainText('Efectivo');
});

test('no hay comprobante para una venta inexistente ni para un identificador inválido', async ({
  page,
}) => {
  const missingId = randomUUID();

  await page.goto(`/sales?receipt=${missingId}`);
  await expect(receiptDialog(page).getByRole('alert')).toContainText('La venta no existe.');
  await expect(ticket(page)).toHaveCount(0);
  await expect(receiptDialog(page).getByRole('button', { name: /Imprimir/ })).toHaveCount(0);
  await expect(page.getByTestId('print-receipt')).toHaveCount(0);
  await saveEvidence(page, 'HU-34', 'HU-34-venta-inexistente.png');

  await page.goto('/sales?receipt=no-es-un-uuid');
  await expect(receiptDialog(page).getByRole('alert')).toBeVisible();
  await expect(ticket(page)).toHaveCount(0);

  expect((await page.request.get(`${BACKEND_URL}/api/sales/${missingId}`)).status()).toBe(404);
  expect(await readSales()).toHaveLength(0);
});

test('tarjeta y fiado muestran lo que corresponde: sin cambio, con cliente solo en fiado', async ({
  page,
}) => {
  await seedCustomer('Doña Marta', '5000.00');

  // Tarjeta.
  await page.goto('/sales');
  await addProduct(page, 'P002', 'Arroz 1 kg');
  await page.getByRole('radio', { name: 'Tarjeta' }).check();
  await page.getByRole('button', { name: 'Finalizar venta' }).click();

  await expect(ticket(page)).toContainText('Tarjeta');
  await expect(ticket(page)).not.toContainText('Efectivo recibido');
  await expect(ticket(page)).not.toContainText('Cambio');
  await receiptDialog(page).getByRole('button', { name: 'Cerrar', exact: true }).last().click();

  // Fiado.
  await page.getByRole('button', { name: 'Nueva venta' }).click();
  await addProduct(page, 'P001', 'Café molido 500 g');
  await page.getByRole('radio', { name: 'Fiado' }).check();
  await page.getByLabel('Cliente', { exact: true }).selectOption({ label: 'Doña Marta' });
  await page.getByRole('button', { name: 'Finalizar venta' }).click();

  await expect(ticket(page)).toContainText('Fiado');
  await expect(ticket(page)).toContainText('Cliente (fiado)');
  await expect(ticket(page)).toContainText('Doña Marta');
  // No se expone el saldo de la deuda en el ticket.
  await expect(ticket(page)).not.toContainText(/6\s500,00/);
  await saveEvidence(page, 'HU-34', 'HU-34-ticket-fiado.png');
});
