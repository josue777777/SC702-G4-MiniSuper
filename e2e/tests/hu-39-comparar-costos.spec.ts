import { expect, test, type Page } from '@playwright/test';
import { insertUser, withDb } from '../support/db';
import { BACKEND_URL } from '../support/env';
import { saveEvidence } from '../support/evidence';
import { resetCatalog, seedProducts, signInAsOwner } from '../support/fixtures';
import { CAJERO, openAs } from '../support/reports';

/**
 * HU-39 — Comparar el costo de un mismo producto entre proveedores, para
 * decidir a quién comprarle en el próximo pedido. Desde Inventario, con el
 * producto marcado, «⚖ Comparar costos» lista los proveedores activos que lo
 * suministran del costo más bajo al más alto, con el ÚLTIMO costo registrado
 * de cada uno; con un solo proveedor lo dice en vez de una comparación vacía.
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
  // El arroz también lo venden otros dos proveedores, más barato y más caro.
  await withDb(async (client) => {
    const rice = await client.query<{ id: string }>(
      `SELECT id FROM "Product" WHERE code = 'ARR-01'`,
    );

    for (const [name, cost] of [
      ['Comercial del Valle', '950.00'],
      ['Abarrotes La Unión', '1010.50'],
    ] as const) {
      const supplier = await client.query<{ id: string }>(
        `INSERT INTO "Supplier"(id, name, "businessId", "updatedAt")
         SELECT gen_random_uuid(), $1, "businessId", now() FROM "Product" WHERE code = 'ARR-01'
         RETURNING id`,
        [name],
      );

      await client.query(
        `INSERT INTO "SupplierProduct"(id, "supplierId", "productId", "unitCost", "isPreferred", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, false, now())`,
        [supplier.rows[0]?.id, rice.rows[0]?.id, cost],
      );
    }
  });
});

/** Marca el producto en Inventario y abre «Comparar costos». */
async function compare(page: Page, code: string, name: string) {
  await page.goto('/inventory');
  await page.getByRole('row', { name: new RegExp(code) }).click();
  await page.getByRole('button', { name: '⚖ Comparar costos' }).click();

  return page.getByRole('dialog', { name: `Comparar costos · ${name}` });
}

test('lista los proveedores del costo más bajo al más alto, con cuánto más cuesta cada uno', async ({
  page,
}) => {
  const dialog = await compare(page, 'ARR-01', 'Arroz blanco 1 kg');
  const rows = dialog.getByRole('table', { name: 'Costos por proveedor' }).locator('tbody tr');

  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Comercial del Valle');
  await expect(rows.nth(0)).toContainText('Más barato');
  await expect(rows.nth(1)).toContainText('Distribuidora Central');
  await expect(rows.nth(1)).toContainText('Principal');
  await expect(rows.nth(1)).toContainText('+₡30,00');
  await expect(rows.nth(2)).toContainText('Abarrotes La Unión');
  await expect(rows.nth(2)).toContainText('+₡60,50');
  await saveEvidence(page, 'HU-39', 'comparar-costos.png');
});

test('refleja el último costo registrado: una compra directa más barata cambia el orden', async ({
  page,
}) => {
  const { riceId, supplierId } = await withDb(async (client) => {
    const rice = await client.query<{ id: string }>(
      `SELECT id FROM "Product" WHERE code = 'ARR-01'`,
    );
    const supplier = await client.query<{ id: string }>(
      `SELECT id FROM "Supplier" WHERE name = 'Abarrotes La Unión'`,
    );

    return { riceId: rice.rows[0]?.id ?? '', supplierId: supplier.rows[0]?.id ?? '' };
  });
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

  // Abarrotes La Unión le vendió el arroz a ₡900 en la última compra.
  const entry = await page.request.post(`${BACKEND_URL}/api/kardex/products/${riceId}/entries`, {
    data: {
      supplierId,
      invoiceNumber: 'AU-77',
      documentDate: today,
      quantity: 5,
      unitCost: '900.00',
    },
  });

  expect(entry.status()).toBe(201);

  const dialog = await compare(page, 'ARR-01', 'Arroz blanco 1 kg');
  const first = dialog
    .getByRole('table', { name: 'Costos por proveedor' })
    .locator('tbody tr')
    .first();

  await expect(first).toContainText('Abarrotes La Unión');
  await expect(first).toContainText('₡900,00');
  await expect(first).toContainText('Más barato');
});

test('con un solo proveedor lo dice en vez de una comparación vacía', async ({ page }) => {
  const dialog = await compare(page, 'CAF-01', 'Café molido 500 g');

  await expect(dialog.getByRole('status')).toHaveText(
    'Solo Distribuidora Central suministra este producto: no hay con quién comparar.',
  );
  await expect(
    dialog.getByRole('table', { name: 'Costos por proveedor' }).locator('tbody tr'),
  ).toHaveCount(1);
  await saveEvidence(page, 'HU-39', 'un-solo-proveedor.png');
});

test('el Cajero no compara costos (no ve compras)', async ({ browser }) => {
  await insertUser(CAJERO);

  const cajero = await openAs(browser, CAJERO);

  await cajero.page.goto('/inventory');
  await expect(cajero.page.getByRole('row', { name: /ARR-01/ })).toBeVisible();
  await expect(cajero.page.getByRole('button', { name: '⚖ Comparar costos' })).toHaveCount(0);

  const api = await cajero.page.request.get(`${BACKEND_URL}/api/suppliers`);

  expect(api.status()).toBe(403);
  await cajero.context.close();
});
