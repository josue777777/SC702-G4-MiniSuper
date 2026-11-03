import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { E2E_BUSINESS_ID, withDb } from './db';
import { BACKEND_URL, FRONTEND_URL } from './env';
import { seedProducts } from './fixtures';

/**
 * Soporte de las pruebas E2E de abonos y liquidación de fiados (HU-19): un
 * producto de ₡1 000 (cada unidad fiada suma ₡1 000), fiados creados con la API
 * REAL de ventas (HU-18), lectores de la ficha del cliente y consultas a la base.
 */

/** Costo por unidad del producto de prueba: cada unidad deja ₡400 de ganancia. */
export const UNIT_PRICE = 1000;

export async function seedCreditProduct(): Promise<void> {
  await seedProducts([
    {
      code: 'P001',
      name: 'Producto de prueba',
      category: 'General',
      price: '1000.00',
      cost: '600.00',
      stock: 100_000,
      supplier: null,
    },
  ]);
}

export async function customerIdByName(name: string): Promise<string> {
  return withDb(async (client) => {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM "Customer" WHERE name = $1 AND "businessId" = $2`,
      [name, E2E_BUSINESS_ID],
    );

    return result.rows[0]?.id ?? '';
  });
}

export async function insertCustomer(name: string): Promise<string> {
  return withDb(async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO "Customer"(id, name, "businessId", "updatedAt") VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id`,
      [name, E2E_BUSINESS_ID],
    );

    return result.rows[0]?.id ?? '';
  });
}

export interface Fiado {
  id: string;
  number: number;
  lineId: string;
}

/** Un fiado REAL por la API de ventas: `units` × ₡1 000. */
export async function apiFiar(
  request: APIRequestContext,
  customerId: string,
  units: number,
): Promise<Fiado> {
  const productId = await withDb(async (client) => {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM "Product" WHERE code = 'P001' AND "businessId" = $1`,
      [E2E_BUSINESS_ID],
    );

    return result.rows[0]?.id ?? '';
  });
  const response = await request.post(`${BACKEND_URL}/api/sales`, {
    headers: { Origin: FRONTEND_URL },
    data: {
      idempotencyKey: randomUUID(),
      paymentMethod: 'CREDIT',
      customerId,
      items: [{ productId, quantity: units }],
    },
  });

  expect(response.status()).toBe(201);

  const sale = (await response.json()) as {
    data: { id: string; number: number; items: { id: string }[] };
  };

  return { id: sale.data.id, number: sale.data.number, lineId: sale.data.items[0]?.id ?? '' };
}

/** Abono por la API (HU-19), con la llave y los datos indicados. */
export async function apiPay(
  request: APIRequestContext,
  customerId: string,
  amount: string,
  extra: Record<string, unknown> = {},
) {
  return request.post(`${BACKEND_URL}/api/customers/${customerId}/payments`, {
    headers: { Origin: FRONTEND_URL },
    data: { idempotencyKey: randomUUID(), amount, ...extra },
  });
}

/** Hoy en Costa Rica (`YYYY-MM-DD`). */
export const todayCR = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

// --- Base de datos ---------------------------------------------------------

export interface DbPayment {
  saleId: string | null;
  operationId: string | null;
  amount: string;
}

export async function dbPayments(customerId: string): Promise<DbPayment[]> {
  return withDb(async (client) => {
    const result = await client.query<DbPayment>(
      `SELECT "saleId", "operationId", amount::text AS amount FROM "CreditPayment"
       WHERE "customerId" = $1 ORDER BY "CreditPayment".amount DESC, id`,
      [customerId],
    );

    return result.rows;
  });
}

export async function dbOperations(customerId: string): Promise<{ total: string; key: string }[]> {
  return withDb(async (client) => {
    const result = await client.query<{ total: string; key: string }>(
      `SELECT "totalAmount"::text AS total, "idempotencyKey" AS key FROM "CreditPaymentOperation"
       WHERE "customerId" = $1 ORDER BY "createdAt", id`,
      [customerId],
    );

    return result.rows;
  });
}

/** Saldo del cliente tal como lo deriva la base: ventas a crédito vigentes − todos sus abonos. */
export async function dbBalance(customerId: string): Promise<string> {
  return withDb(async (client) => {
    const result = await client.query<{ balance: string }>(
      `SELECT (COALESCE((SELECT sum(total) FROM "Sale" WHERE "customerId" = $1 AND "paymentMethod" = 'CREDIT'), 0)
             - COALESCE((SELECT sum(amount) FROM "CreditPayment" WHERE "customerId" = $1), 0))::text AS balance`,
      [customerId],
    );

    return result.rows[0]?.balance ?? '0';
  });
}

// --- Pantalla --------------------------------------------------------------

/** Abre Clientes, busca al cliente por nombre y abre su cuenta. Devuelve la ficha. */
export async function openAccount(page: Page, name: string): Promise<Locator> {
  await page.goto('/customers');
  await page.getByLabel('Buscar cliente por nombre').fill(name);
  await page.getByRole('button', { name: `Ver cuenta de ${name}` }).click();

  const account = page.getByRole('region', { name: `Cuenta de ${name}` });

  await expect(account).toBeVisible();
  await expect(account.getByText('Cargando la cuenta del cliente…')).toHaveCount(0);

  return account;
}

/** Los dígitos de un importe en pantalla (`₡6 000,00` → `600000`). */
export const digits = (text: string | null) => (text ?? '').replace(/\D/g, '');

export async function accountTile(account: Locator, label: string): Promise<string> {
  return (
    (await account
      .locator('.stat-tile', { hasText: label })
      .locator('.stat-tile__value')
      .textContent()) ?? ''
  );
}

/** Valor de una fila del resumen del abono (`Deuda actual`, `Monto a abonar`, `Nuevo saldo`). */
export async function summaryOf(page: Page, label: string): Promise<string> {
  const summary = page.getByRole('region', { name: 'Resumen del abono' });

  return (
    (await summary
      .locator('div', { has: page.locator('dt', { hasText: label }) })
      .locator('dd')
      .first()
      .textContent()) ?? ''
  );
}

/** Abre «Registrar abono» desde la ficha y devuelve el modal. */
export async function openPaymentModal(page: Page, account: Locator): Promise<Locator> {
  await account.getByRole('button', { name: 'Registrar abono' }).click();

  const dialog = page.getByRole('dialog', { name: 'Registrar abono' });

  await expect(dialog).toBeVisible();

  return dialog;
}
