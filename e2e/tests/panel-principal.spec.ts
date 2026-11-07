import { expect, test, type Page } from '@playwright/test';
import { insertUser, withDb } from '../support/db';
import { BACKEND_URL } from '../support/env';
import { saveEvidence } from '../support/evidence';
import { resetCatalog, seedProducts, signInAsOwner, stockOf } from '../support/fixtures';
import { CAJERO, openAs } from '../support/reports';

/**
 * Panel principal con foco: «Lo urgente hoy» muestra solo las tres urgencias más
 * graves (el resto, en «Ver todo»), cada una con su acción a la mano; sin nada
 * pendiente dice «¡Está al día!». Las alertas de stock bajo (HU-08) y de
 * vencimientos (HU-09) siguen en el panel, y el resumen de ventas del día
 * (HU-37) también. La barra de comandos (Ctrl + K) lleva a cualquier parte sin
 * el ratón.
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
    {
      code: 'LEC-01',
      name: 'Leche entera 1 L',
      category: 'Lácteos',
      price: '900.00',
      cost: '650.00',
      stock: 12,
      supplier: null,
    },
  ]);
});

function urgentSection(page: Page) {
  return page.getByRole('region', { name: 'Lo urgente hoy' });
}

/** Pedido de 5 arroces con una entrega registrada y la carga pendiente (HU-38). */
async function orderWithPendingLoad(page: Page): Promise<void> {
  const { supplierId, rice } = await withDb(async (client) => {
    const supplier = await client.query<{ id: string }>(
      `SELECT id FROM "Supplier" WHERE name = 'Distribuidora Central'`,
    );
    const product = await client.query<{ id: string }>(
      `SELECT id FROM "Product" WHERE code = 'ARR-01'`,
    );

    return { supplierId: supplier.rows[0]?.id ?? '', rice: product.rows[0]?.id ?? '' };
  });
  const order = await page.request.post(`${BACKEND_URL}/api/purchase-orders`, {
    data: { supplierId, items: [{ productId: rice, quantity: 5 }] },
  });
  const orderId = ((await order.json()) as { data: { id: string } }).data.id;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
  const receipt = await page.request.post(
    `${BACKEND_URL}/api/purchase-orders/${orderId}/receipts`,
    {
      data: {
        invoiceNumber: 'F-500',
        receivedOn: today,
        loadNow: false,
        items: [{ productId: rice, quantity: 5 }],
      },
    },
  );

  expect(receipt.status()).toBe(201);
}

test('sin nada pendiente, el panel dice que está al día', async ({ page }) => {
  await page.goto('/');

  await expect(urgentSection(page).getByRole('status')).toContainText('¡Está al día!');
  // HU-37: el resumen del día sigue en el panel, con totales en cero y un mensaje claro.
  await expect(page.getByRole('heading', { name: 'Resumen de ventas de hoy' })).toBeVisible();
  // Lo que es de reportes ya no está en el inicio.
  await expect(page.getByText('Productos con más valor en inventario')).toHaveCount(0);
  await expect(page.getByText('Inventario valorizado')).toHaveCount(0);
  await saveEvidence(page, 'panel', 'panel-al-dia.png');
});

test('solo las tres urgencias más graves, y la factura se carga desde la tarjeta', async ({
  page,
}) => {
  await withDb(async (client) => {
    // Vencido (crítico), sin stock (crítico) y por vencer.
    await client.query(
      `UPDATE "Product" SET "expirationDate" = now() - interval '3 days' WHERE code = 'LEC-01'`,
    );
    await client.query(`UPDATE "Product" SET stock = 0, "minStock" = 5 WHERE code = 'CAF-01'`);
    await client.query(
      `UPDATE "Product" SET "expirationDate" = now() + interval '5 days' WHERE code = 'ARR-01'`,
    );
  });
  await orderWithPendingLoad(page);
  await page.goto('/');

  const urgent = urgentSection(page);
  const cards = urgent.getByRole('article');

  // Cuatro urgencias (vencido, stock, factura, por vencer): se ven tres. El
  // pedido llegó completo, así que ya no «espera mercadería».
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText('1 producto vencido');
  await expect(cards.nth(0)).toContainText('Crítico');
  await expect(cards.nth(1)).toContainText('Café molido 500 g');
  await expect(cards.nth(2)).toContainText('Factura F-500 sin cargar al inventario');
  await saveEvidence(page, 'panel', 'panel-urgencias.png');

  // HU-08: la lista completa del stock bajo, en una ventana.
  await cards.nth(1).getByRole('button', { name: 'Ver productos' }).click();
  await expect(page.getByRole('dialog', { name: 'Stock bajo' })).toContainText('CAF-01');
  await page.getByRole('dialog', { name: 'Stock bajo' }).getByLabel('Cerrar').click();

  // Lo demás, tras «Ver todo».
  await urgent.getByRole('button', { name: 'Ver todo (4)' }).click();

  const all = page.getByRole('dialog', { name: 'Todo lo pendiente' });

  await expect(all.getByRole('article')).toHaveCount(4);
  await expect(all).toContainText('1 producto vence en menos de 15 días');
  await expect(all).not.toContainText('espera mercadería');
  await all.getByLabel('Cerrar').click();

  // Acción instantánea: se carga la factura sin salir del panel.
  await cards.nth(2).getByRole('button', { name: 'Cargar al inventario' }).click();
  await expect(urgent.getByText('Factura F-500 sin cargar al inventario')).toHaveCount(0);
  expect(await stockOf('ARR-01')).toBe(45);
});

test('Ctrl + K: ir a una tarea o a un producto sin el ratón', async ({ page }) => {
  await page.goto('/');
  await expect(urgentSection(page)).toBeVisible();
  await page.keyboard.press('Control+k');

  const palette = page.getByRole('dialog', { name: 'Buscar o ir a…' });
  const input = palette.getByRole('combobox', { name: 'Qué quiere hacer' });

  await expect(input).toBeFocused();
  await input.fill('conteo');
  await saveEvidence(page, 'panel', 'barra-de-comandos.png');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/inventory/);
  await expect(page.getByRole('dialog', { name: 'Conteo físico' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Conteo físico' }).getByLabel('Cerrar').click();

  // Un producto: con ↓ se elige y Enter abre sus movimientos.
  await page.keyboard.press('Control+k');
  await input.fill('cafe');
  await expect(palette.getByRole('option')).toHaveCount(1);
  await input.press('Enter');
  await expect(page).toHaveURL(/\/movimientos\?productId=/);

  // También se abre con el botón de la barra superior.
  await page.getByRole('button', { name: /Buscar o ir a…/ }).click();
  await input.fill('reporte');
  await input.press('ArrowDown');
  await expect(palette.getByRole('option', { selected: true })).toContainText(
    'Ver los conteos físicos',
  );
  await input.press('Enter');
  await expect(page).toHaveURL(/reporte=physical-counts/);
});

test('el Cajero no ve urgencias ni atajos de pedidos', async ({ browser }) => {
  await withDb((client) =>
    client.query(`UPDATE "Product" SET stock = 0, "minStock" = 5 WHERE code = 'CAF-01'`),
  );
  await insertUser(CAJERO);

  const cajero = await openAs(browser, CAJERO);

  await cajero.page.goto('/');
  // Solo el stock bajo (HU-08): nada de pedidos ni facturas.
  await expect(urgentSection(cajero.page).getByRole('article')).toHaveCount(1);
  await cajero.page.keyboard.press('Control+k');
  await cajero.page.getByRole('combobox', { name: 'Qué quiere hacer' }).fill('pedido');
  await expect(cajero.page.getByRole('option')).toHaveCount(0);
  await cajero.context.close();
});

test('«Ver pedidos» de la tarjeta es un botón y lleva a Pedidos', async ({ page }) => {
  const { supplierId, rice } = await withDb(async (client) => {
    const supplier = await client.query<{ id: string }>(
      `SELECT id FROM "Supplier" WHERE name = 'Distribuidora Central'`,
    );
    const product = await client.query<{ id: string }>(
      `SELECT id FROM "Product" WHERE code = 'ARR-01'`,
    );

    return { supplierId: supplier.rows[0]?.id ?? '', rice: product.rows[0]?.id ?? '' };
  });
  const order = await page.request.post(`${BACKEND_URL}/api/purchase-orders`, {
    data: { supplierId, items: [{ productId: rice, quantity: 5 }] },
  });

  expect(order.status()).toBe(201);
  await page.goto('/');

  const card = urgentSection(page).getByRole('article', { name: '1 pedido espera mercadería' });
  const link = card.getByRole('link', { name: 'Ver pedidos' });

  await expect(link).toHaveClass(/button/);
  // Una acción no se ve como enlace suelto: sin subrayado (docs/PANTALLAS.md).
  await expect(link).toHaveCSS('text-decoration-line', 'none');
  await saveEvidence(page, 'panel', 'panel-ver-pedidos.png');
  await link.click();
  await expect(page).toHaveURL(/\/orders/);
});
