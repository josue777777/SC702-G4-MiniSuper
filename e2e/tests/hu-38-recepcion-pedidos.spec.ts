import { expect, test, type Page } from '@playwright/test';
import { withDb } from '../support/db';
import { BACKEND_URL } from '../support/env';
import { saveEvidence } from '../support/evidence';
import { resetCatalog, seedProducts, signInAsOwner, stockOf } from '../support/fixtures';

/**
 * HU-38 — Recibir un pedido en una o varias entregas, cada una con su factura,
 * la fecha REAL en que llegó y la cantidad real. Al registrarla se elige si se
 * carga ya al inventario o si la carga queda pendiente para confirmarla
 * después. El pedido sigue abierto hasta que llega todo o se da por concluido.
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
      code: 'CAF-01',
      name: 'Café molido 500 g',
      category: 'Abarrotes',
      price: '4200.00',
      cost: '3100.00',
      stock: 18,
      supplier: 'Distribuidora Central',
    },
  ]);
});

/** Pedido de 10 arroces y 4 cafés, creado por la API (la pantalla de pedidos ya tiene sus pruebas). */
async function createOrder(page: Page): Promise<void> {
  const { supplierId, ids } = await withDb(async (client) => {
    const supplier = await client.query<{ id: string }>(
      `SELECT id FROM "Supplier" WHERE name = 'Distribuidora Central'`,
    );
    const products = await client.query<{ id: string; code: string }>(
      `SELECT id, code FROM "Product" WHERE code IN ('ARR-01', 'CAF-01')`,
    );

    return {
      supplierId: supplier.rows[0]?.id ?? '',
      ids: Object.fromEntries(products.rows.map((row) => [row.code, row.id])),
    };
  });
  const created = await page.request.post(`${BACKEND_URL}/api/purchase-orders`, {
    data: {
      supplierId,
      items: [
        { productId: ids['ARR-01'], quantity: 10 },
        { productId: ids['CAF-01'], quantity: 4 },
      ],
    },
  });

  expect(created.status()).toBe(201);
}

function orderDialog(page: Page) {
  return page.getByRole('dialog', { name: /^Pedido PED-0001/ });
}

function receiptDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Registrar entrega · PED-0001' });
}

async function openOrder(page: Page): Promise<void> {
  await page.goto('/orders');
  await page.getByRole('button', { name: 'Ver pedido PED-0001' }).click();
  await expect(orderDialog(page)).toBeVisible();
}

test('entrega parcial cargada ya, segunda con la carga pendiente y confirmada después', async ({
  page,
}) => {
  await createOrder(page);
  await openOrder(page);

  // Primera entrega: llegaron 6 arroces y los 4 cafés.
  await orderDialog(page).getByRole('button', { name: '📦 Registrar entrega' }).click();

  const first = receiptDialog(page);

  await first.getByLabel('N.º de factura').fill('F-100');
  await first.getByLabel('Llegó de Arroz blanco 1 kg').fill('6');
  await expect(first.getByLabel('Llegó de Café molido 500 g')).toHaveValue('4');
  await saveEvidence(page, 'HU-38', 'registrar-entrega.png');
  await first.getByRole('button', { name: 'Registrar y cargar al inventario' }).click();
  await expect(first).toHaveCount(0);

  const order = orderDialog(page);

  await expect(order.getByText('Recibido en parte')).toBeVisible();
  await expect(order.getByText('Faltan 4 unidades.', { exact: false })).toBeVisible();
  expect(await stockOf('ARR-01')).toBe(46);
  expect(await stockOf('CAF-01')).toBe(22);

  // Segunda: solo falta el arroz; se registra y la carga queda pendiente.
  await order.getByRole('button', { name: '📦 Registrar entrega' }).click();

  const second = receiptDialog(page);

  await expect(second.getByLabel('Llegó de Café molido 500 g')).toHaveCount(0);
  await second.getByLabel('N.º de factura').fill('F-101');
  await second.getByRole('button', { name: 'Registrar y dejar la carga pendiente' }).click();
  await expect(second).toHaveCount(0);
  await expect(order.locator('.order-meta')).toContainText('Recibido ·');
  expect(await stockOf('ARR-01')).toBe(46);

  const deliveries = order.getByRole('table', { name: 'Entregas del pedido' });

  await expect(deliveries.locator('tbody tr')).toHaveCount(2);
  await expect(deliveries).toContainText('Arroz blanco 1 kg × 4');
  await saveEvidence(page, 'HU-38', 'entregas-carga-pendiente.png');

  // En el historial se ve que hay una carga pendiente.
  await order.getByText('Cerrar', { exact: true }).click();
  await expect(page.getByText('Carga pendiente', { exact: true })).toBeVisible();

  // Se confirma la carga: ahora sí sube el stock, una sola vez.
  await page.getByRole('button', { name: 'Ver pedido PED-0001' }).click();
  await orderDialog(page)
    .getByRole('button', { name: 'Cargar al inventario la factura F-101' })
    .click();
  await expect(orderDialog(page).getByText(/^Cargada ·/)).toHaveCount(2);
  expect(await stockOf('ARR-01')).toBe(50);

  // El Kardex sabe de qué pedido y factura salió cada entrada.
  const reasons = await withDb(async (client) => {
    const result = await client.query<{ reason: string }>(
      `SELECT reason FROM "InventoryMovement" WHERE type = 'ENTRY' AND "purchaseOrderId" IS NOT NULL ORDER BY reason`,
    );

    return result.rows.map((row) => row.reason);
  });

  expect(reasons).toEqual([
    'Recepción PED-0001 · Factura F-100',
    'Recepción PED-0001 · Factura F-100',
    'Recepción PED-0001 · Factura F-101',
  ]);
});

test('un pedido que llegó en parte se da por concluido y ya no recibe más', async ({ page }) => {
  await createOrder(page);
  await openOrder(page);
  await orderDialog(page).getByRole('button', { name: '📦 Registrar entrega' }).click();

  const receipt = receiptDialog(page);

  await receipt.getByLabel('N.º de factura').fill('F-200');
  await receipt.getByLabel('Llegó de Arroz blanco 1 kg').fill('0');
  await receipt.getByRole('button', { name: 'Registrar y cargar al inventario' }).click();
  await expect(receipt).toHaveCount(0);

  const order = orderDialog(page);

  await order.getByRole('button', { name: 'Dar por concluido' }).click();
  await order.getByRole('button', { name: 'Sí, dar por concluido' }).click();
  await expect(order.locator('.order-meta')).toContainText('Recibido ·');
  await expect(order.getByRole('button', { name: '📦 Registrar entrega' })).toHaveCount(0);
  expect(await stockOf('ARR-01')).toBe(40);
  expect(await stockOf('CAF-01')).toBe(22);
});

test('no guarda una entrega sin factura, con más de lo que falta o sin nada', async ({ page }) => {
  await createOrder(page);
  await openOrder(page);
  await orderDialog(page).getByRole('button', { name: '📦 Registrar entrega' }).click();

  const receipt = receiptDialog(page);
  const save = receipt.getByRole('button', { name: 'Registrar y cargar al inventario' });
  const error = receipt.getByRole('alert');

  await save.click();
  await expect(error).toHaveText('Indique el número de factura.');

  await receipt.getByLabel('N.º de factura').fill('F-300');
  await receipt.getByLabel('Llegó de Arroz blanco 1 kg').fill('11');
  await save.click();
  await expect(error).toHaveText('De Arroz blanco 1 kg faltan 10: no puede llegar más.');

  await receipt.getByLabel('Llegó de Arroz blanco 1 kg').fill('0');
  await receipt.getByLabel('Llegó de Café molido 500 g').fill('0');
  await save.click();
  await expect(error).toHaveText('Anote al menos un producto que haya llegado.');
  expect(await stockOf('ARR-01')).toBe(40);
});
