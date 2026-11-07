import { expect, test } from '@playwright/test';
import { withDb } from '../support/db';
import { saveEvidence } from '../support/evidence';
import { resetCatalog, seedProducts, signInAsOwner } from '../support/fixtures';

/**
 * HU-24 — Nuevo pedido. Al elegir el proveedor, sus productos se ven de 4 en 4
 * con un buscador: un catálogo grande no estira la ventana. Las cantidades
 * escritas se conservan al cambiar de página o de búsqueda y el total suma todo
 * el pedido.
 */

test.beforeEach(async ({ page }) => {
  await signInAsOwner(page);
  await resetCatalog();
  await seedProducts(
    ['Arroz', 'Azúcar', 'Café', 'Frijoles', 'Harina', 'Sal'].map((name, index) => ({
      code: `P-0${index + 1}`,
      name: `${name} 1 kg`,
      category: 'Abarrotes',
      price: '1500.00',
      cost: '1000.00',
      stock: 10,
      supplier: 'Distribuidora Central',
    })),
  );
});

test('los productos del proveedor se ven de 4 en 4, con buscador, y se piden de varias páginas', async ({
  page,
}) => {
  await page.goto('/orders');
  await page.getByRole('button', { name: '+ Nuevo pedido' }).click();

  const form = page.getByRole('dialog', { name: 'Nuevo pedido' });
  const rows = form.getByRole('table', { name: 'Productos del proveedor' }).locator('tbody tr');

  await form.getByLabel('Proveedor *').selectOption({ label: 'Distribuidora Central' });
  await expect(rows).toHaveCount(4);
  await form.getByLabel('Cantidad de Arroz 1 kg').fill('3');
  await saveEvidence(page, 'HU-24', 'nuevo-pedido-paginado.png');

  // Página 2: los otros dos; lo escrito en la página 1 se conserva.
  await form
    .getByRole('navigation', { name: 'Páginas de productos' })
    .getByRole('button', { name: '2' })
    .click();
  await expect(rows).toHaveCount(2);
  await form.getByLabel('Cantidad de Sal 1 kg').fill('2');

  // Buscar: solo lo que coincide.
  await form.getByLabel('Buscar producto del proveedor').fill('caf');
  await expect(rows).toHaveCount(1);
  await expect(form).toContainText('Total (2 producto(s))');

  await form.getByRole('button', { name: 'Generar pedido' }).click();
  await expect(form).toHaveCount(0);

  const items = await withDb(async (client) => {
    const result = await client.query<{ code: string; quantity: number }>(
      `SELECT p.code, i.quantity FROM "PurchaseOrderItem" i JOIN "Product" p ON p.id = i."productId" ORDER BY p.code`,
    );

    return result.rows;
  });

  expect(items).toEqual([
    { code: 'P-01', quantity: 3 },
    { code: 'P-06', quantity: 2 },
  ]);
});
