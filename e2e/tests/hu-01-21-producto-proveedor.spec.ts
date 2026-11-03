import { expect, test } from '@playwright/test';
import { withDb } from '../support/db';
import { saveEvidence } from '../support/evidence';
import { resetCatalog, signInAsOwner } from '../support/fixtures';

/**
 * HU-01 y HU-21: al crear un producto, la categoría y el proveedor se pueden
 * registrar sin salir del formulario, y lo ya escrito del producto se conserva.
 * Navegador real + backend real + PostgreSQL de pruebas, con el catálogo vacío.
 */

test.beforeEach(async ({ page }) => {
  await resetCatalog();
  await signInAsOwner(page);
});

test('HU-01/HU-21: crea categoría y proveedor desde el modal del producto sin perder lo escrito', async ({
  page,
}) => {
  await page.goto('/inventory');
  await page.getByRole('button', { name: '+ Crear' }).click();

  const modal = page.getByRole('dialog', { name: 'Crear producto' });

  // Lo primero que escribe: no debe perderse.
  await modal.getByLabel('Nombre del producto').fill('Café molido 500 g');
  await modal.getByLabel('Código', { exact: true }).fill('CAF-500');

  // Categoría nueva, sin salir.
  await modal.getByRole('button', { name: '+ Nueva categoría' }).click();
  await modal.locator('#category-name').fill('Abarrotes');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(modal.getByLabel('Categoría')).toHaveValue(/.+/);

  // Proveedor nuevo, sin salir: primero sin contacto, para ver la validación.
  await modal.getByRole('button', { name: '+ Nuevo proveedor' }).click();
  await modal.locator('#quick-supplier-name').fill('Distribuidora Central');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(
    modal.getByText('Indique al menos un dato de contacto: teléfono o correo.'),
  ).toBeVisible();
  await modal.locator('#quick-supplier-phone').fill('2222-3333');
  await saveEvidence(page, 'HU-21', 'HU-21-proveedor-desde-producto.png');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();

  // Queda seleccionado, y lo escrito del producto sigue ahí.
  await expect(modal.locator('#quick-supplier-name')).toHaveCount(0);
  await expect(modal.getByLabel('Proveedor principal').locator('option:checked')).toHaveText(
    'Distribuidora Central',
  );
  await expect(modal.getByLabel('Nombre del producto')).toHaveValue('Café molido 500 g');
  await expect(modal.getByLabel('Código', { exact: true })).toHaveValue('CAF-500');

  // Se completa y se guarda el producto.
  await modal.getByRole('tab', { name: 'Precios' }).click();
  await modal.getByLabel('Precio de compra (₡)').fill('1800');
  await modal.getByLabel('Precio de venta (₡)').fill('2500');
  await modal.getByRole('tab', { name: 'Existencias' }).click();
  await modal.getByLabel('Stock inicial').fill('12');
  await modal.getByRole('button', { name: /Crear producto/ }).click();

  await expect(page.getByRole('row', { name: /CAF-500/ })).toBeVisible();

  const saved = await withDb((client) =>
    client.query<{ supplier: string }>(
      `SELECT s.name AS supplier FROM "Product" p
       JOIN "SupplierProduct" sp ON sp."productId" = p.id
       JOIN "Supplier" s ON s.id = sp."supplierId"
       WHERE p.code = 'CAF-500'`,
    ),
  );

  expect(saved.rows[0]?.supplier).toBe('Distribuidora Central');
});
