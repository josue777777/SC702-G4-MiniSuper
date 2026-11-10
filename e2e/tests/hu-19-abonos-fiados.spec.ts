import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { insertUser, withDb } from '../support/db';
import { BACKEND_URL, FRONTEND_URL } from '../support/env';
import { saveEvidence } from '../support/evidence';
import { E2E_ADMIN, resetCatalog, signInAsOwner, signInVia } from '../support/fixtures';
import {
  accountTile,
  apiFiar,
  apiPay,
  customerIdByName,
  dbBalance,
  dbOperations,
  dbPayments,
  digits,
  insertCustomer,
  openAccount,
  openPaymentModal,
  readAccountTable,
  seedCreditProduct,
  summaryOf,
  todayCR,
} from '../support/credit';
import {
  BODEGA,
  CAJERO,
  OTHER_OWNER,
  centsOf,
  consult,
  openAs,
  openReport,
  readTable,
  seedOtherBusiness,
  seedPayment,
  setPeriod,
  tile,
  tileCents,
  trackRuntimeErrors,
} from '../support/reports';

/**
 * HU-19 — Liquidar fiado de un cliente (issue #20). Navegador real + backend real +
 * PostgreSQL de pruebas. Los fiados se crean con la API REAL de ventas (HU-18); los
 * abonos, la liquidación y los reportes HU-29/HU-30 se usan con la interfaz real.
 *
 * Criterios: (1) buscar al cliente y ver su deuda; (2) registrar monto y fecha;
 * (3) la deuda se actualiza o se marca saldada; (4) pago igual a la deuda = saldada;
 * (5) la ficha refleja el nuevo saldo al instante; (6) si el pago supera la deuda,
 * se advierte la diferencia ANTES de confirmar.
 */

test.beforeEach(async ({ page }) => {
  await signInAsOwner(page);
  await resetCatalog();
  await seedCreditProduct();
});

const money = (colones: number) => String(colones * 100);

async function confirmPayment(page: Page, amount: string, note?: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Registrar abono' });

  await dialog.getByLabel('Monto a pagar').fill(amount);

  if (note !== undefined) {
    await dialog.getByLabel('Nota (opcional)').fill(note);
  }

  await dialog.getByRole('button', { name: 'Confirmar abono' }).click();
  await expect(dialog).toBeHidden();
}

const notice = (page: Page) =>
  page.getByRole('status').filter({ hasText: 'registrado correctamente' });

test('flujo completo: cliente → fiado real → abono parcial → liquidación → HU-30 y HU-29', async ({
  page,
}) => {
  const errors = trackRuntimeErrors(page);
  const name = 'Doña Marta Prueba';

  // 1. Registrar un cliente desde Clientes.
  await page.goto('/customers');
  await page.getByRole('button', { name: '+ Nuevo cliente' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Guardar cliente' }).click();
  await expect(page.getByText(`Cliente "${name}" creado.`)).toBeVisible();

  // 2. Dos fiados REALES por la caja: ₡6 000 y ₡4 000.
  const customerId = await customerIdByName(name);
  const first = await apiFiar(page.request, customerId, 6);
  const second = await apiFiar(page.request, customerId, 4);

  // 3. Buscar al cliente y abrir su ficha: deuda inicial (criterio 1).
  await page.reload();
  await page.getByLabel('Buscar clientes').fill('marta');
  await expect(page.getByRole('table', { name: 'Clientes' }).locator('tbody tr')).toHaveCount(1);
  expect(
    digits(
      await page
        .getByRole('row', { name: new RegExp(name) })
        .locator('td')
        .nth(2)
        .textContent(),
    ),
  ).toBe(money(10000));
  await page.getByRole('button', { name: `Ver cuenta de ${name}` }).click();

  const account = page.getByRole('dialog', { name: `Cuenta de ${name}` });

  await expect(account.locator('.badge', { hasText: 'Con deuda' })).toBeVisible();
  expect(digits(await accountTile(account, 'Deuda actual'))).toBe(money(10000));
  expect(digits(await accountTile(account, 'Total abonado'))).toBe('000');
  expect(await accountTile(account, 'Fiados pendientes')).toBe('2');
  expect(
    (await readAccountTable(page, 'Fiados del cliente')).rows.map((row) => [
      row[0],
      digits(row[2] ?? ''),
      digits(row[5] ?? ''),
      row[6],
    ]),
  ).toEqual([
    [`#${first.number}`, money(6000), money(6000), 'Pendiente'],
    [`#${second.number}`, money(4000), money(4000), 'Pendiente'],
  ]);
  await expect(
    account.getByText('Este cliente todavía no tiene abonos registrados.'),
  ).toBeVisible();

  // 4. Abono parcial: la vista previa muestra deuda, monto, nuevo saldo y a qué fiado va (criterios 2 y 3).
  const dialog = await openPaymentModal(page, account);

  await expect(dialog.getByLabel('Fecha del pago')).toHaveValue(todayCR());
  await dialog.getByLabel('Monto a pagar').fill('4000');
  expect(digits(await summaryOf(page, 'Deuda actual'))).toBe(money(10000));
  expect(digits(await summaryOf(page, 'Monto a abonar'))).toBe(money(4000));
  expect(digits(await summaryOf(page, 'Nuevo saldo'))).toBe(money(6000));
  await expect(dialog.getByText(`fiado #${first.number} (`)).toContainText('₡4');
  await confirmPayment(page, '4000', 'Primer abono');

  // 5. La ficha refleja el nuevo saldo al instante, sin recargar (criterio 5).
  await expect(notice(page)).toContainText('Abono de');
  await expect(notice(page)).toContainText('Saldo pendiente');
  expect(digits(await notice(page).textContent())).toContain(money(4000));
  await expect
    .poll(async () => digits(await accountTile(account, 'Deuda actual')))
    .toBe(money(6000));
  expect(digits(await accountTile(account, 'Total abonado'))).toBe(money(4000));
  expect(
    (await readAccountTable(page, 'Fiados del cliente')).rows.map((row) => [
      row[0],
      digits(row[4] ?? ''),
      digits(row[5] ?? ''),
      row[6],
    ]),
  ).toEqual([
    [`#${first.number}`, money(4000), money(2000), 'Pago parcial'],
    [`#${second.number}`, '000', money(4000), 'Pendiente'],
  ]);
  const history = (await readAccountTable(page, 'Historial de abonos')).rows;

  expect(history).toHaveLength(1);
  expect(history[0]?.[0]).toBe(todayCR().split('-').reverse().join('/'));
  expect(digits(history[0]?.[1] ?? '')).toBe(money(4000));
  expect(history[0]?.[2]).toContain(`Fiado #${first.number}`);
  expect(history[0]?.[3]).toBe('Primer abono');
  // También en la lista de clientes.
  expect(
    digits(
      await page
        .getByRole('row', { name: new RegExp(name) })
        .locator('td')
        .nth(2)
        .textContent(),
    ),
  ).toBe(money(6000));

  // 6. Persistencia en PostgreSQL: una operación, una fila ligada a la venta, y el mismo saldo.
  const operations = await dbOperations(customerId);

  expect(operations.map((operation) => operation.total)).toEqual(['4000.00']);
  expect(await dbPayments(customerId)).toEqual([
    { saleId: first.id, operationId: expect.any(String), amount: '4000.00' },
  ]);
  expect(await dbBalance(customerId)).toBe('6000.00');

  // 7. HU-30 refleja el saldo actualizado: lo que falta de cada fiado y el total por cobrar.
  await openReport(page, 'Deudas de clientes');
  const debts = await readTable(page, 'Deudas de clientes');

  expect(
    debts.rows.map((row) => [row[0], row[1], digits(row[5] ?? ''), digits(row[6] ?? '')]),
  ).toEqual([
    [name, `#${first.number}`, money(2000), money(2000)],
    [name, `#${second.number}`, money(4000), money(6000)],
  ]);
  expect(await tileCents(page, 'Total general de deudas')).toBe(600_000);

  // HU-29 con un abono PARCIAL: nada de ese fiado se cuenta todavía (no se sabe qué productos cubrió).
  await page.getByRole('tab', { name: 'Ganancias' }).click();
  await setPeriod(page, todayCR(), todayCR());
  await consult(page);
  expect(await tileCents(page, 'Ganancia bruta')).toBe(0);
  expect(await tile(page, 'Fiados excluidos (pendientes)')).toBe('2');
  expect(await tileCents(page, 'Monto de fiados excluidos')).toBe(1_000_000);

  // 8. Pago restante: se liquida todo y la cuenta queda saldada (criterio 4).
  const settledAccount = await openAccount(page, name);
  const finalDialog = await openPaymentModal(page, settledAccount);

  // El monto restante es exactamente la deuda: no hay advertencia de exceso.
  await finalDialog.getByLabel('Monto a pagar').fill('6000.00');
  await expect(finalDialog.getByText('supera la deuda pendiente')).toHaveCount(0);
  expect(digits(await summaryOf(page, 'Nuevo saldo'))).toBe('000');
  await confirmPayment(page, '6000.00');

  await expect(notice(page)).toContainText(
    'El cliente ya no tiene fiados pendientes. Cuenta saldada.',
  );
  await expect(settledAccount.locator('.toolbar .badge', { hasText: 'Saldado' })).toBeVisible();
  await expect
    .poll(async () => digits(await accountTile(settledAccount, 'Deuda actual')))
    .toBe('000');
  expect(
    (await readAccountTable(page, 'Fiados del cliente')).rows.map((row) => [
      row[0],
      digits(row[5] ?? ''),
      row[6],
    ]),
  ).toEqual([
    [`#${first.number}`, '000', 'Saldado'],
    [`#${second.number}`, '000', 'Saldado'],
  ]);
  await expect(settledAccount.getByRole('button', { name: 'Registrar abono' })).toBeDisabled();
  await expect(
    settledAccount.getByText('Este cliente no tiene fiados pendientes. Cuenta saldada.'),
  ).toBeVisible();

  // El abono de ₡6 000 se repartió entre los dos fiados y en el historial es UNA operación.
  const finalHistory = (await readAccountTable(page, 'Historial de abonos')).rows;

  expect(finalHistory).toHaveLength(2);
  expect(digits(finalHistory[0]?.[1] ?? '')).toBe(money(6000));
  expect(finalHistory[0]?.[2]).toContain(`Fiado #${first.number} (`);
  expect(finalHistory[0]?.[2]).toContain(`Fiado #${second.number} (`);

  // 9. Base de datos: 2 operaciones, 3 filas ligadas, saldo en cero.
  expect((await dbOperations(customerId)).map((operation) => operation.total)).toEqual([
    '4000.00',
    '6000.00',
  ]);
  expect((await dbPayments(customerId)).map((payment) => payment.amount)).toEqual([
    '4000.00',
    '4000.00',
    '2000.00',
  ]);
  expect(
    (await dbPayments(customerId)).every(
      (payment) => payment.saleId !== null && payment.operationId !== null,
    ),
  ).toBe(true);
  expect(await dbBalance(customerId)).toBe('0.00');

  // 10. HU-30: el cliente ya no debe nada. HU-29: los dos fiados liquidados entran completos, una sola vez.
  await openReport(page, 'Deudas de clientes');
  await expect(
    page.getByRole('status').filter({ hasText: 'No hay clientes con deudas pendientes.' }),
  ).toBeVisible();
  expect(await tileCents(page, 'Total general de deudas')).toBe(0);

  await page.getByRole('tab', { name: 'Ganancias' }).click();
  await setPeriod(page, todayCR(), todayCR());
  await consult(page);
  // 10 unidades × (₡1 000 − ₡600).
  expect(await tileCents(page, 'Ingresos considerados')).toBe(1_000_000);
  expect(await tileCents(page, 'Costos correspondientes')).toBe(600_000);
  expect(await tileCents(page, 'Ganancia bruta')).toBe(400_000);
  expect(await tile(page, 'Ventas consideradas')).toBe('2');
  expect(await tile(page, 'Fiados excluidos (pendientes)')).toBe('0');
  const profitRows = (await readTable(page, 'Reporte de ganancias')).rows;

  expect(profitRows).toHaveLength(2);
  expect(profitRows.every((row) => row[4] === 'Fiado cobrado')).toBe(true);
  expect(profitRows.reduce((sum, row) => sum + centsOf(row[10] ?? ''), 0)).toBe(400_000);

  expect(errors).toEqual([]);
});

test('evidencia: dos fiados, un abono de ₡8 000 saldando uno y dejando el otro parcialmente pendiente', async ({
  page,
}) => {
  const name = 'Cliente de Evidencia';
  const customerId = await insertCustomer(name);
  const first = await apiFiar(page.request, customerId, 6);
  const second = await apiFiar(page.request, customerId, 4);
  const account = await openAccount(page, name);
  const dialog = await openPaymentModal(page, account);

  await dialog.getByLabel('Monto a pagar').fill('8000');
  await dialog.getByLabel('Nota (opcional)').fill('Abono quincenal');
  // FIFO: ₡6 000 al fiado más antiguo y ₡2 000 al siguiente.
  await expect(dialog.getByText(`fiado #${first.number} (`)).toBeVisible();
  expect(digits(await summaryOf(page, 'Nuevo saldo'))).toBe(money(2000));
  await dialog.getByRole('button', { name: 'Confirmar abono' }).click();
  await expect(dialog).toBeHidden();

  await expect(notice(page)).toContainText('Saldo pendiente');
  await expect
    .poll(async () => digits(await accountTile(account, 'Deuda actual')))
    .toBe(money(2000));
  expect(await accountTile(account, 'Fiados pendientes')).toBe('1');
  await expect(account.locator('.toolbar .badge', { hasText: 'Con deuda' })).toBeVisible();

  const fiados = (await readAccountTable(page, 'Fiados del cliente')).rows;

  expect(fiados.map((row) => [row[0], digits(row[4] ?? ''), digits(row[5] ?? ''), row[6]])).toEqual(
    [
      // Los fiados que todavía se deben van primero; los saldados, después.
      [`#${second.number}`, money(2000), money(2000), 'Pago parcial'],
      [`#${first.number}`, money(6000), '000', 'Saldado'],
    ],
  );

  const history = (await readAccountTable(page, 'Historial de abonos')).rows;

  expect(history).toHaveLength(1);
  // Una sola operación con el reparto: ₡6 000 al fiado más antiguo y ₡2 000 al siguiente.
  expect(digits(history[0]?.[2] ?? '')).toBe(
    `${first.number}${money(6000)}${second.number}${money(2000)}`,
  );
  expect(history[0]?.[3]).toBe('Abono quincenal');
  expect(await dbBalance(customerId)).toBe('2000.00');

  await page.setViewportSize({ width: 1440, height: 1100 });
  await saveEvidence(page, 'HU-19', 'HU-19-liquidacion-fiado.png', { fullPage: true });
});

test('criterio 6: un pago superior a la deuda se advierte ANTES de confirmar y no se registra', async ({
  page,
}) => {
  const name = 'Cliente Exceso';
  const customerId = await insertCustomer(name);

  await apiFiar(page.request, customerId, 10);

  const posts: string[] = [];

  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/payments')) {
      posts.push(request.url());
    }
  });

  const account = await openAccount(page, name);
  const dialog = await openPaymentModal(page, account);

  await dialog.getByLabel('Monto a pagar').fill('12000');

  // La advertencia aparece al escribir, con la diferencia, y no deja confirmar.
  const warning = dialog
    .getByRole('alert')
    .filter({ hasText: 'El pago supera la deuda pendiente por' });

  await expect(warning).toBeVisible();
  expect(digits(await warning.textContent())).toBe(money(2000));
  await expect(dialog.getByRole('button', { name: 'Confirmar abono' })).toBeDisabled();
  expect(digits(await summaryOf(page, 'Deuda actual'))).toBe(money(10000));
  await expect(
    page
      .getByRole('region', { name: 'Resumen del abono' })
      .locator('div', { has: page.locator('dt', { hasText: 'Nuevo saldo' }) })
      .locator('dd'),
  ).toHaveText('—');
  expect(posts).toEqual([]);
  expect(await dbOperations(await customerIdByName(name))).toEqual([]);

  // Se ajusta explícitamente a la deuda real y entonces se confirma.
  await dialog.getByRole('button', { name: 'Ajustar al monto de la deuda' }).click();
  await expect(dialog.getByLabel('Monto a pagar')).toHaveValue('10000.00');
  await expect(warning).toHaveCount(0);
  expect(digits(await summaryOf(page, 'Nuevo saldo'))).toBe('000');
  await dialog.getByRole('button', { name: 'Confirmar abono' }).click();
  await expect(notice(page)).toContainText('Cuenta saldada');
  expect(posts).toHaveLength(1);
  expect(await dbBalance(customerId)).toBe('0.00');
});

test('montos inválidos muestran su mensaje y no se envían al servidor', async ({ page }) => {
  const name = 'Cliente Validaciones';
  const customerId = await insertCustomer(name);

  await apiFiar(page.request, customerId, 5);

  const posts: string[] = [];

  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/payments')) {
      posts.push(request.url());
    }
  });

  const account = await openAccount(page, name);
  const dialog = await openPaymentModal(page, account);
  const amount = dialog.getByLabel('Monto a pagar');
  const confirm = dialog.getByRole('button', { name: 'Confirmar abono' });

  // Sin monto el botón no está apagado: al intentar confirmar dice qué falta.
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog.getByText('Ingrese el monto a pagar.')).toBeVisible();
  expect(posts).toEqual([]);

  for (const [value, message] of [
    ['abc', 'Escriba un importe válido, sin signo y con hasta dos decimales.'],
    ['-5', 'Escriba un importe válido, sin signo y con hasta dos decimales.'],
    ['10.123', 'Escriba un importe válido, sin signo y con hasta dos decimales.'],
    ['0', 'El monto debe ser mayor que cero.'],
    ['0.00', 'El monto debe ser mayor que cero.'],
  ] as const) {
    await amount.fill(value);
    await expect(dialog.getByText(message)).toBeVisible();
    await expect(confirm).toBeDisabled();
  }

  // Sin monto, el mensaje aparece al intentar confirmar con el formulario.
  await amount.fill('');
  await dialog.getByLabel('Nota (opcional)').press('Enter');
  await expect(dialog.getByText('Ingrese el monto a pagar.')).toBeVisible();

  // Fecha vacía.
  await amount.fill('1000');
  await dialog.getByLabel('Fecha del pago').fill('');
  await expect(dialog.getByText('Indique la fecha del pago.')).toBeVisible();
  await expect(confirm).toBeDisabled();
  expect(posts).toEqual([]);

  // El servidor también rechaza lo mismo si alguien se salta la pantalla.
  for (const invalid of ['0', '-5', '10.123', 'abc', '']) {
    expect((await apiPay(page.request, customerId, invalid)).status()).toBe(400);
  }

  expect(
    (await apiPay(page.request, customerId, '1000.00', { paymentDate: '2999-01-01' })).status(),
  ).toBe(400);
  expect(
    (await apiPay(page.request, customerId, '1000.00', { paymentDate: '2020-01-01' })).status(),
  ).toBe(400);
  expect(await dbOperations(customerId)).toEqual([]);
});

test('un cliente sin deuda lo dice claramente y no admite abonos', async ({ page }) => {
  const name = 'Cliente Sin Deuda';
  const customerId = await insertCustomer(name);
  const account = await openAccount(page, name);

  await expect(account.getByText('Este cliente no tiene fiados pendientes.')).toBeVisible();
  await expect(account.getByRole('button', { name: 'Registrar abono' })).toBeDisabled();
  expect(digits(await accountTile(account, 'Deuda actual'))).toBe('000');
  await expect(account.getByRole('table', { name: 'Fiados del cliente' })).toHaveCount(0);

  // Ni siquiera por la API.
  const response = await apiPay(page.request, customerId, '100.00');

  expect(response.status()).toBe(409);
  expect(((await response.json()) as { error: { message: string } }).error.message).toBe(
    'Este cliente no tiene fiados pendientes.',
  );
  expect(await dbOperations(customerId)).toEqual([]);
});

test('varios fiados: FIFO, abono a un fiado específico y un cliente sin coincidencias en la búsqueda', async ({
  page,
}) => {
  const name = 'Cliente Varios Fiados';
  const customerId = await insertCustomer(name);
  const first = await apiFiar(page.request, customerId, 6);
  const second = await apiFiar(page.request, customerId, 3);
  const account = await openAccount(page, name);

  // FIFO: ₡7 000 saldan el primero y dejan ₡2 000 pendientes en el segundo.
  await openPaymentModal(page, account);
  await confirmPayment(page, '7000');
  await expect
    .poll(async () => digits(await accountTile(account, 'Deuda actual')))
    .toBe(money(2000));
  expect(
    (await readAccountTable(page, 'Fiados del cliente')).rows.map((row) => [
      row[0],
      digits(row[5] ?? ''),
      row[6],
    ]),
  ).toEqual([
    [`#${second.number}`, money(2000), 'Pago parcial'],
    [`#${first.number}`, '000', 'Saldado'],
  ]);
  expect((await dbPayments(customerId)).map((payment) => [payment.saleId, payment.amount])).toEqual(
    [
      [first.id, '6000.00'],
      [second.id, '1000.00'],
    ],
  );

  // Un fiado específico: solo se ofrecen los que aún deben.
  const dialog = await openPaymentModal(page, account);

  await dialog.getByRole('radio', { name: /Un fiado específico/ }).check();
  await expect(dialog.locator('#payment-sale option')).toHaveCount(2);
  await dialog.locator('#payment-sale').selectOption({ index: 1 });
  await dialog.getByLabel('Monto a pagar').fill('500');
  await expect(dialog.getByText(`fiado #${second.number} (`)).toBeVisible();
  await confirmPayment(page, '500');
  await expect
    .poll(async () => digits(await accountTile(account, 'Deuda actual')))
    .toBe(money(1500));
  // De mayor a menor: ₡6 000 y ₡1 000 del reparto FIFO, y los ₡500 dirigidos al segundo fiado.
  expect((await dbPayments(customerId)).map((payment) => [payment.saleId, payment.amount])).toEqual(
    [
      [first.id, '6000.00'],
      [second.id, '1000.00'],
      [second.id, '500.00'],
    ],
  );

  // Más de lo pendiente de ese fiado: advertencia con el fiado y la diferencia.
  const third = await openPaymentModal(page, account);

  await third.getByRole('radio', { name: /Un fiado específico/ }).check();
  await third.locator('#payment-sale').selectOption({ index: 1 });
  await third.getByLabel('Monto a pagar').fill('2000');
  await expect(
    third.getByText(`El pago supera lo pendiente del fiado #${second.number}`),
  ).toBeVisible();
  await expect(third.getByRole('button', { name: 'Confirmar abono' })).toBeDisabled();
  await third.getByRole('button', { name: 'Cancelar' }).click();

  // La búsqueda por nombre (con la cuenta cerrada: la ventana tapa la pantalla).
  await account.getByRole('button', { name: 'Cerrar', exact: true }).first().click();
  await expect(account).toHaveCount(0);
  await page.getByLabel('Buscar clientes').fill('zzz');
  await expect(page.getByText('Ningún cliente coincide con «zzz».')).toBeVisible();
});

test('reintentos y doble clic no duplican el abono; la misma llave con otros datos se rechaza', async ({
  page,
}) => {
  const name = 'Cliente Reintentos';
  const customerId = await insertCustomer(name);

  await apiFiar(page.request, customerId, 10);

  // Doble clic REAL sobre «Confirmar abono»: se guarda una sola vez.
  const account = await openAccount(page, name);
  const dialog = await openPaymentModal(page, account);

  await dialog.getByLabel('Monto a pagar').fill('3000');
  await dialog.getByRole('button', { name: 'Confirmar abono' }).dblclick();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await dbOperations(customerId)).length).toBe(1);
  expect((await dbPayments(customerId)).map((payment) => payment.amount)).toEqual(['3000.00']);

  // Reenvío exacto de la MISMA operación (como un reintento del navegador): 200, sin duplicar.
  const key = '0e2e1111-0000-4000-8000-000000000019';
  const body = { idempotencyKey: key, amount: '1000.00', notes: 'Reintento' };
  const first = await page.request.post(`${BACKEND_URL}/api/customers/${customerId}/payments`, {
    headers: { Origin: FRONTEND_URL },
    data: body,
  });
  const retry = await page.request.post(`${BACKEND_URL}/api/customers/${customerId}/payments`, {
    headers: { Origin: FRONTEND_URL },
    data: body,
  });

  expect(first.status()).toBe(201);
  expect(retry.status()).toBe(200);
  expect(((await retry.json()) as { data: { replayed: boolean } }).data.replayed).toBe(true);
  expect(await dbOperations(customerId)).toHaveLength(2);
  expect(await dbBalance(customerId)).toBe('6000.00');

  // La misma llave con otro monto o nota: rechazada.
  for (const other of [{ amount: '2000.00' }, { notes: 'Otra nota' }]) {
    const rejected = await page.request.post(
      `${BACKEND_URL}/api/customers/${customerId}/payments`,
      {
        headers: { Origin: FRONTEND_URL },
        data: { ...body, ...other },
      },
    );

    expect(rejected.status()).toBe(409);
  }

  expect(await dbOperations(customerId)).toHaveLength(2);
  expect(await dbBalance(customerId)).toBe('6000.00');
});

test('dos abonos simultáneos de ₡8 000 sobre ₡10 000: solo uno se confirma y el otro recibe un aviso claro', async ({
  page,
}) => {
  const name = 'Cliente Simultáneo';
  const customerId = await insertCustomer(name);

  await apiFiar(page.request, customerId, 10);

  const responses = await Promise.all([
    apiPay(page.request, customerId, '8000.00'),
    apiPay(page.request, customerId, '8000.00'),
  ]);
  const statuses = responses.map((response) => response.status()).sort();

  expect(statuses).toEqual([201, 409]);

  const rejected = responses.find((response) => response.status() === 409);
  const error = (
    (await rejected?.json()) as { error: { message: string; details: { reason: string } } }
  ).error;

  expect(error.details.reason).toBe('EXCEEDS_DEBT');
  expect(error.message).toContain('supera la deuda pendiente');
  expect(await dbOperations(customerId)).toHaveLength(1);
  expect(await dbBalance(customerId)).toBe('2000.00');

  // La ficha muestra el saldo real.
  const account = await openAccount(page, name);

  expect(digits(await accountTile(account, 'Deuda actual'))).toBe(money(2000));
});

test('devoluciones (HU-35): bajan el importe vigente y no se permiten si dejarían más abonado que la venta', async ({
  page,
}) => {
  const name = 'Cliente Devoluciones';
  const customerId = await insertCustomer(name);
  const fiado = await apiFiar(page.request, customerId, 10);
  const adjust = (type: 'RETURN' | 'VOID', quantity?: number) =>
    page.request.post(`${BACKEND_URL}/api/sales/${fiado.id}/adjustments`, {
      headers: { Origin: FRONTEND_URL },
      data: {
        type,
        reason: 'Prueba E2E',
        ...(quantity === undefined ? {} : { items: [{ saleItemId: fiado.lineId, quantity }] }),
      },
    });

  // ₡10 000 con ₡6 000 abonados y una devolución de ₡3 000: el importe vigente es ₡7 000 y quedan ₡1 000.
  expect((await apiPay(page.request, customerId, '6000.00')).status()).toBe(201);
  expect((await adjust('RETURN', 3)).status()).toBe(200);

  const account = await openAccount(page, name);

  expect(digits(await accountTile(account, 'Deuda actual'))).toBe(money(1000));
  expect(
    (await readAccountTable(page, 'Fiados del cliente')).rows.map((row) => [
      digits(row[2] ?? ''),
      digits(row[3] ?? ''),
      digits(row[4] ?? ''),
      digits(row[5] ?? ''),
    ]),
  ).toEqual([[money(10000), money(7000), money(6000), money(1000)]]);

  // Se paga lo que queda (₡1 000) y entonces ya no se puede devolver más: quedaría más abonado que el importe.
  expect((await apiPay(page.request, customerId, '1000.00')).status()).toBe(201);

  const before = await dbBalance(customerId);
  const rejected = await adjust('RETURN', 1);

  expect(rejected.status()).toBe(409);
  expect(((await rejected.json()) as { error: { message: string } }).error.message).toContain(
    'ya tiene ₡7 000,00 abonados',
  );
  expect((await adjust('VOID')).status()).toBe(409);
  expect(await dbBalance(customerId)).toBe(before);
  expect(await dbBalance(customerId)).toBe('0.00');
});

test('un abono anterior a HU-19 (sin fiado asignado) se conserva, baja el saldo y no se atribuye a ninguna venta', async ({
  page,
}) => {
  const name = 'Cliente Histórico';
  const customerId = await insertCustomer(name);
  const first = await apiFiar(page.request, customerId, 6);

  await apiFiar(page.request, customerId, 3);
  // Abono general de antes: sin venta ni operación.
  await seedPayment(customerId, '2000.00');

  const account = await openAccount(page, name);

  expect(digits(await accountTile(account, 'Deuda actual'))).toBe(money(7000));
  await expect(account.getByText('Incluye')).toContainText(
    'abonos anteriores que no están asignados a ningún fiado',
  );
  expect((await readAccountTable(page, 'Historial de abonos')).rows[0]?.[2]).toBe(
    'Sin fiado asignado (abono anterior)',
  );
  // Ninguna venta se da por abonada.
  expect(
    (await readAccountTable(page, 'Fiados del cliente')).rows.map((row) => digits(row[4] ?? '')),
  ).toEqual(['000', '000']);

  // Solo se puede abonar la deuda real (₡7 000), y el abono anterior no se toca.
  const dialog = await openPaymentModal(page, account);

  await dialog.getByLabel('Monto a pagar').fill('7001');
  await expect(dialog.getByText('El pago supera la deuda pendiente por')).toBeVisible();
  await confirmPayment(page, '7000');
  await expect.poll(async () => digits(await accountTile(account, 'Deuda actual'))).toBe('000');
  expect(first.id).not.toBe('');
  expect(
    (await dbPayments(customerId)).filter(
      (payment) => payment.saleId === null && payment.operationId === null,
    ),
  ).toHaveLength(1);
  expect(await dbBalance(customerId)).toBe('0.00');
});

async function statuses(request: APIRequestContext, customerId: string): Promise<number[]> {
  return Promise.all([
    request.get(`${BACKEND_URL}/api/customers/${customerId}/credit`).then((r) => r.status()),
    request.get(`${BACKEND_URL}/api/customers/${customerId}/payments`).then((r) => r.status()),
    apiPay(request, customerId, '100.00').then((r) => r.status()),
  ]);
}

test('permisos: Encargado y Cajero registran abonos; Bodega, plataforma y sin sesión no', async ({
  page,
  browser,
  request,
}) => {
  await insertUser(CAJERO);
  await insertUser(BODEGA);

  const customerId = await insertCustomer('Cliente Permisos');

  await apiFiar(page.request, customerId, 10);

  // Sin sesión y la plataforma.
  expect(await statuses(request, customerId)).toEqual([401, 401, 401]);
  await signInVia(request, E2E_ADMIN);
  expect(await statuses(request, customerId)).toEqual([403, 403, 403]);

  // Bodega: ni la API ni la pantalla de Clientes.
  const bodeguero = await openAs(browser, BODEGA);

  expect(await statuses(bodeguero.context.request, customerId)).toEqual([403, 403, 403]);
  await bodeguero.page.goto('/customers');
  await expect(bodeguero.page.getByRole('heading', { name: 'Acceso no permitido' })).toBeVisible();
  await bodeguero.context.close();
  expect(await dbOperations(customerId)).toEqual([]);

  // Cajero (su permiso `customers` incluye los abonos): lo hace con la interfaz.
  const cajera = await openAs(browser, CAJERO);
  const account = await openAccount(cajera.page, 'Cliente Permisos');
  const dialog = await openPaymentModal(cajera.page, account);

  await dialog.getByLabel('Monto a pagar').fill('2500');
  await dialog.getByRole('button', { name: 'Confirmar abono' }).click();
  await expect(
    cajera.page.getByRole('status').filter({ hasText: 'registrado correctamente' }),
  ).toBeVisible();
  expect(await dbBalance(customerId)).toBe('7500.00');
  expect(await dbOperations(customerId)).toHaveLength(1);
  await cajera.context.close();
});

test('aislamiento: un negocio no ve ni abona a los clientes de otro, ni usa sus ventas', async ({
  page,
  browser,
}) => {
  await seedOtherBusiness();

  const mine = await insertCustomer('Cliente Mío');
  const foreign = await withDb(async (client) => {
    const customer = await client.query<{ id: string }>(
      `SELECT id FROM "Customer" WHERE name = 'Cliente Ajeno'`,
    );
    const sale = await client.query<{ id: string }>(
      `SELECT id FROM "Sale" WHERE "customerId" = $1`,
      [customer.rows[0]?.id],
    );

    return { customerId: customer.rows[0]?.id ?? '', saleId: sale.rows[0]?.id ?? '' };
  });

  await apiFiar(page.request, mine, 5);

  // El dueño de las pruebas no ve ni abona al cliente ajeno.
  expect(
    (await page.request.get(`${BACKEND_URL}/api/customers/${foreign.customerId}/credit`)).status(),
  ).toBe(404);
  expect(
    (
      await page.request.get(`${BACKEND_URL}/api/customers/${foreign.customerId}/payments`)
    ).status(),
  ).toBe(404);
  expect((await apiPay(page.request, foreign.customerId, '100.00')).status()).toBe(404);

  // Y no puede aplicar un abono propio a la venta de otro negocio.
  expect((await apiPay(page.request, mine, '100.00', { saleId: foreign.saleId })).status()).toBe(
    404,
  );
  expect(await dbPayments(foreign.customerId)).toEqual([]);
  expect(await dbPayments(mine)).toEqual([]);

  // La lista de clientes no ofrece al cliente ajeno.
  await page.goto('/customers');
  await expect(page.getByRole('row', { name: /Cliente Mío/ })).toBeVisible();
  await expect(page.getByText('Cliente Ajeno')).toHaveCount(0);

  // El otro dueño solo ve lo suyo y no puede tocar a nuestro cliente.
  const other = await openAs(browser, OTHER_OWNER);

  expect(
    (await other.context.request.get(`${BACKEND_URL}/api/customers/${mine}/credit`)).status(),
  ).toBe(404);
  expect((await apiPay(other.context.request, mine, '100.00')).status()).toBe(404);

  const account = await openAccount(other.page, 'Cliente Ajeno');

  expect(digits(await accountTile(account, 'Deuda actual'))).toBe(money(7777));
  await expect(other.page.getByText('Cliente Mío')).toHaveCount(0);
  await other.context.close();
  expect(await dbPayments(mine)).toEqual([]);
});

// --- Descubribilidad y pantallas (docs/PANTALLAS.md) -------------------------

/** La fila de un cliente en la lista de Clientes. */
const customerRow = (page: Page, name: string) =>
  page.getByRole('table', { name: 'Clientes' }).getByRole('row', { name });

const paymentDialog = (page: Page) => page.getByRole('dialog', { name: 'Registrar abono' });

test('«Registrar abono» está a la vista en la fila del cliente: abona sin abrir la cuenta y la lista se actualiza sola', async ({
  page,
}) => {
  const name = 'Cliente Acción Directa';
  const customerId = await insertCustomer(name);

  await apiFiar(page.request, customerId, 6);
  await page.goto('/customers');
  await page.getByLabel('Buscar clientes').fill(name);

  const row = customerRow(page, name);
  const pay = row.getByRole('button', { name: `Registrar abono a ${name}` });
  const debt = async () => digits(await row.locator('td').nth(2).textContent());

  // Sin abrir nada más: el botón está en la fila, visible y activo.
  await expect(pay).toBeInViewport();
  await expect(pay).toBeEnabled();
  await expect(row.getByRole('button', { name: `Ver cuenta de ${name}` })).toBeEnabled();
  expect(await debt()).toBe(money(6000));
  await saveEvidence(page, 'HU-19', 'HU-19-clientes-registrar-abono.png');

  // Cancelar vuelve a la lista (de donde se pidió), sin abrir la cuenta.
  await pay.click();
  await expect(paymentDialog(page)).toBeVisible();
  await paymentDialog(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Un pago parcial: el aviso queda en la lista y la deuda baja sin recargar.
  await pay.click();
  await confirmPayment(page, '2500');
  await expect(notice(page)).toContainText('Saldo pendiente');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(debt).toBe(money(3500));
  expect((await dbPayments(customerId)).map((payment) => payment.amount)).toEqual(['2500.00']);
  expect(await dbBalance(customerId)).toBe('3500.00');

  // Liquidar el resto: la cuenta queda saldada y el botón se apaga diciendo por qué.
  await pay.click();
  await confirmPayment(page, '3500');
  await expect(notice(page)).toContainText('Cuenta saldada');
  await expect.poll(debt).toBe('000');
  await expect(pay).toBeDisabled();
  await expect(pay).toHaveAttribute('title', 'Este cliente no tiene deuda.');
  expect(await dbBalance(customerId)).toBe('0.00');
});

test('desde la cuenta del cliente, «Cancelar» vuelve a la cuenta y un abono la deja actualizada', async ({
  page,
}) => {
  const name = 'Cliente Contexto';
  const customerId = await insertCustomer(name);

  await apiFiar(page.request, customerId, 5);

  const account = await openAccount(page, name);

  await openPaymentModal(page, account);
  await paymentDialog(page).getByRole('button', { name: 'Cancelar' }).click();

  // Volvió a la cuenta del MISMO cliente, no a la lista.
  await expect(account).toBeVisible();
  expect(digits(await accountTile(account, 'Deuda actual'))).toBe(money(5000));

  await openPaymentModal(page, account);
  await confirmPayment(page, '1000');
  await expect(account).toBeVisible();
  await expect(notice(page)).toContainText('Saldo pendiente');
  await expect
    .poll(async () => digits(await accountTile(account, 'Deuda actual')))
    .toBe(money(4000));
  expect(await dbBalance(customerId)).toBe('4000.00');
});

test('la cuenta pagina de 4 en 4: fiados con los pendientes primero e historial pedido al servidor', async ({
  page,
}) => {
  const name = 'Cliente Muchos Movimientos';
  const customerId = await insertCustomer(name);
  const fiados = [];

  for (let index = 0; index < 5; index += 1) {
    fiados.push(await apiFiar(page.request, customerId, 1));
  }

  // Cinco abonos de ₡100, uno por uno: cinco operaciones en el historial.
  for (let index = 0; index < 5; index += 1) {
    expect((await apiPay(page.request, customerId, '100.00')).status()).toBe(201);
  }

  const account = await openAccount(page, name);
  const fiadosTable = account.getByRole('table', { name: 'Fiados del cliente' });
  const historyTable = account.getByRole('table', { name: 'Historial de abonos' });

  await expect(fiadosTable.locator('tbody tr')).toHaveCount(4);
  await expect(historyTable.locator('tbody tr')).toHaveCount(4);
  await expect(account.getByText('Mostrando 1–4 de 5 fiados')).toBeVisible();
  await expect(account.getByText('Mostrando 1–4 de 5 abonos')).toBeVisible();

  // Los ₡500 abonados entraron al primer fiado (de ₡1 000): sigue pendiente y va primero.
  expect((await readAccountTable(page, 'Fiados del cliente')).rows.map((row) => row[0])).toEqual(
    fiados.slice(0, 4).map((fiado) => `#${fiado.number}`),
  );

  // La segunda página de cada lista trae lo que falta y no mueve la otra.
  await account
    .getByRole('navigation', { name: 'Páginas de fiados' })
    .getByRole('button', { name: 'Siguiente' })
    .click();
  await expect(fiadosTable.locator('tbody tr')).toHaveCount(1);
  await expect(historyTable.locator('tbody tr')).toHaveCount(4);
  await account
    .getByRole('navigation', { name: 'Páginas del historial de abonos' })
    .getByRole('button', { name: 'Siguiente' })
    .click();
  await expect(historyTable.locator('tbody tr')).toHaveCount(1);
  await expect(account.getByText('Mostrando 5–5 de 5 abonos')).toBeVisible();
  await saveEvidence(page, 'HU-19', 'HU-19-cuenta-paginada.png');

  // El servidor manda solo la página pedida y rechaza lo que no es una página válida.
  const base = `${BACKEND_URL}/api/customers/${customerId}/payments`;
  const second = (await (await page.request.get(`${base}?page=2&pageSize=4`)).json()) as {
    data: { items: unknown[]; total: number };
  };

  expect([second.data.items.length, second.data.total]).toEqual([1, 5]);
  expect((await page.request.get(`${base}?page=0`)).status()).toBe(400);
  expect((await page.request.get(`${base}?pageSize=51`)).status()).toBe(400);
});

test('en una pantalla angosta el botón «Registrar abono» sigue al alcance y la ventana cabe', async ({
  page,
}) => {
  const name = 'Cliente Pantalla Chica';
  const customerId = await insertCustomer(name);

  await apiFiar(page.request, customerId, 3);
  await page.setViewportSize({ width: 420, height: 800 });
  await page.goto('/customers');
  await page.getByLabel('Buscar clientes').fill(name);

  const pay = customerRow(page, name).getByRole('button', { name: `Registrar abono a ${name}` });

  await pay.scrollIntoViewIfNeeded();
  await expect(pay).toBeInViewport();
  await pay.click();
  // Ya cargó el formulario (la ventana tiene su tamaño final) antes de medirla.
  await expect(paymentDialog(page).getByLabel('Monto a pagar')).toBeVisible();

  const box = await paymentDialog(page).boundingBox();

  expect(box !== null && box.x >= 0 && box.x + box.width <= 420).toBe(true);
  await paymentDialog(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(paymentDialog(page)).toBeHidden();
});

test('«Cerrar» la cuenta vuelve a Clientes sin perder la búsqueda ni la página', async ({
  page,
}) => {
  // 17 clientes: la lista tiene dos páginas (15 por página).
  for (let index = 1; index <= 17; index += 1) {
    await insertCustomer(`Cliente Página ${String(index).padStart(2, '0')}`);
  }

  const target = 'Cliente Página 17';

  await page.goto('/customers');
  await page
    .getByRole('navigation', { name: 'Páginas de clientes' })
    .getByRole('button', { name: 'Ir a la página 2' })
    .click();
  await page.getByRole('button', { name: `Ver cuenta de ${target}` }).click();

  const account = page.getByRole('dialog', { name: `Cuenta de ${target}` });

  await expect(account).toBeVisible();
  await account.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
  await expect(account).toHaveCount(0);

  // Sigue en la página 2, con el mismo cliente a la vista.
  await expect(
    page
      .getByRole('navigation', { name: 'Páginas de clientes' })
      .getByRole('button', { name: 'Ir a la página 2' }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: `Ver cuenta de ${target}` })).toBeVisible();

  // Con una búsqueda: al cerrar, el texto buscado sigue ahí.
  await page.getByLabel('Buscar clientes').fill('Página 03');
  await page.getByRole('button', { name: 'Ver cuenta de Cliente Página 03' }).click();
  await page
    .getByRole('dialog', { name: 'Cuenta de Cliente Página 03' })
    .getByRole('button', { name: 'Cerrar', exact: true })
    .last()
    .click();
  await expect(page.getByLabel('Buscar clientes')).toHaveValue('Página 03');
  await expect(page.getByRole('table', { name: 'Clientes' }).locator('tbody tr')).toHaveCount(1);
});

test('en una pantalla angosta la cuenta del cliente cabe y deja registrar el abono', async ({
  page,
}) => {
  const name = 'Cliente Cuenta Angosta';
  const customerId = await insertCustomer(name);

  await apiFiar(page.request, customerId, 2);
  await page.setViewportSize({ width: 420, height: 800 });

  const account = await openAccount(page, name);
  const box = await account.boundingBox();

  expect(box !== null && box.x >= 0 && box.x + box.width <= 420).toBe(true);
  await openPaymentModal(page, account);
  await confirmPayment(page, '2000');
  await expect(notice(page)).toContainText('Cuenta saldada');
  expect(await dbBalance(customerId)).toBe('0.00');
});
