/**
 * HU-36 — historial de compras y fiados del cliente. Comprueba compras reales
 * con el backend y PostgreSQL E2E y consulta el historial desde la ficha vigente.
 */
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Locator } from '@playwright/test';
import { E2E_BUSINESS_ID, withDb } from '../support/db';
import { BACKEND_URL, FRONTEND_URL } from '../support/env';
import { apiFiar, apiPay, insertCustomer, openAccount, seedCreditProduct } from '../support/credit';
import { resetCatalog, signInAsOwner } from '../support/fixtures';

test.beforeEach(async ({ page }) => {
  await signInAsOwner(page);
  await resetCatalog();
  await seedCreditProduct();
});

test('muestra contado y fiados pendientes, parciales y liquidados en orden reciente', async ({
  page,
}) => {
  const name = `HU36 Historial ${randomUUID().slice(0, 8)}`;
  const customerId = await insertCustomer(name);
  const settled = await apiFiar(page.request, customerId, 1);
  const partial = await apiFiar(page.request, customerId, 2);
  const pending = await apiFiar(page.request, customerId, 3);

  expect((await apiPay(page.request, customerId, '1000.00', { saleId: settled.id })).status()).toBe(
    201,
  );
  expect((await apiPay(page.request, customerId, '500.00', { saleId: partial.id })).status()).toBe(
    201,
  );

  const cash = await createPaidSale(page.request, customerId, 'CASH');
  const card = await createPaidSale(page.request, customerId, 'CARD');
  const account = await openAccount(page, name);
  await account.getByRole('button', { name: 'Ver historial de compras' }).click();
  const history = account.getByRole('table', { name: 'Compras del cliente' });
  const firstPageRows = history.locator('tbody tr');

  await expect(firstPageRows).toHaveCount(4);
  const numbers = (await firstPageRows.allTextContents()).map((text) =>
    Number(text.match(/#(\d+)/)?.[1]),
  );

  expect(numbers).toEqual([card.number, cash.number, pending.number, partial.number]);
  await expect(firstPageRows.nth(0)).toContainText('Contado');
  await expect(firstPageRows.nth(0)).toContainText('Tarjeta');
  await expect(rowFor(history, pending.number)).toContainText('Pendiente');
  await expect(rowFor(history, partial.number)).toContainText('Pago parcial');

  await rowFor(history, cash.number)
    .getByRole('button', { name: `Ver detalle de la compra ${cash.number}` })
    .click();
  await expect(
    account.getByRole('heading', { name: `Detalle de compra #${cash.number}` }),
  ).toBeVisible();
  await expect(account.getByRole('table', { name: 'Productos de la compra' })).toContainText(
    'Producto de prueba',
  );
  await account.getByRole('button', { name: 'Volver al historial de compras' }).click();

  await account.getByRole('button', { name: 'Siguiente' }).click();
  await expect(history.locator('tbody tr')).toHaveCount(1);
  await expect(rowFor(history, settled.number)).toContainText('Liquidado');
  await account.getByRole('button', { name: 'Cerrar' }).click();
});

test('indica cuando un cliente no tiene compras registradas', async ({ page }) => {
  const name = `HU36 Sin compras ${randomUUID().slice(0, 8)}`;
  await insertCustomer(name);

  const account = await openAccount(page, name);
  await account.getByRole('button', { name: 'Ver historial de compras' }).click();

  await expect(
    account.getByText('No hay historial de compras disponible para este cliente.'),
  ).toBeVisible();
});

/**
 * Ubica una fila por número de venta dentro del historial del cliente.
 *
 * @param table Tabla de compras del cliente.
 * @param number Número consecutivo de venta.
 * @returns La fila de esa venta.
 */
function rowFor(table: Locator, number: number): Locator {
  return table.locator('tbody tr').filter({ hasText: `#${number}` });
}

/**
 * Registra una compra al contado o con tarjeta asociada a un cliente.
 *
 * @param request Sesión autenticada de Playwright.
 * @param customerId Cliente al que se atribuye la compra.
 * @param method Método de pago de contado.
 * @returns Número consecutivo de la venta confirmada.
 */
async function createPaidSale(
  request: APIRequestContext,
  customerId: string,
  method: 'CASH' | 'CARD',
): Promise<{ number: number }> {
  const productId = await withDb(async (client) => {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM "Product" WHERE code = $1 AND "businessId" = $2 ORDER BY "createdAt" DESC LIMIT 1`,
      ['P001', E2E_BUSINESS_ID],
    );

    return result.rows[0]?.id ?? '';
  });
  const response = await request.post(`${BACKEND_URL}/api/sales`, {
    headers: { Origin: FRONTEND_URL },
    data: {
      idempotencyKey: randomUUID(),
      paymentMethod: method,
      customerId,
      ...(method === 'CASH' ? { cashReceived: '1000.00' } : {}),
      items: [{ productId, quantity: 1 }],
    },
  });

  expect(response.status()).toBe(201);
  return (await response.json()).data as { number: number };
}
