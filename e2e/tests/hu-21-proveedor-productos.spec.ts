import { expect, test, type Page } from '@playwright/test';
import { withDb } from '../support/db';
import { saveEvidence } from '../support/evidence';
import { resetCatalog, seedProducts, signInAsOwner } from '../support/fixtures';

/**
 * HU-21 — Productos de un proveedor, en ventanas que no crecen
 * (docs/PANTALLAS.md, reglas 2 y 3): de 4 en 4, con buscador cuando hay más de
 * una página, y los productos se AGREGAN buscándolos, nunca con una lista
 * desplegable de todo el catálogo.
 */

test.beforeEach(async ({ page }) => {
  await signInAsOwner(page);
  await resetCatalog();
  await seedProducts([
    ...['Arroz', 'Azúcar', 'Café', 'Frijoles', 'Harina', 'Sal'].map((name, index) => ({
      code: `P-0${index + 1}`,
      name: `${name} 1 kg`,
      category: 'Abarrotes',
      price: '1500.00',
      cost: '1000.00',
      stock: 10,
      supplier: 'Distribuidora Central',
    })),
    {
      code: 'MAN-01',
      name: 'Mantequilla 250 g',
      category: 'Lácteos',
      price: '1800.00',
      cost: '1200.00',
      stock: 5,
      supplier: 'Lácteos del Valle',
    },
  ]);
});

async function linkedCodes(): Promise<string[]> {
  return withDb(async (client) => {
    const result = await client.query<{ code: string }>(
      `SELECT p.code FROM "SupplierProduct" sp
         JOIN "Supplier" s ON s.id = sp."supplierId"
         JOIN "Product" p ON p.id = sp."productId"
       WHERE s.name = 'Distribuidora Central' ORDER BY p.code`,
    );

    return result.rows.map((row) => row.code);
  });
}

async function openSuppliers(page: Page): Promise<void> {
  await page.goto('/orders?seccion=proveedores');
}

test('«N productos» del proveedor: de 4 en 4 y con buscador', async ({ page }) => {
  await openSuppliers(page);
  await page.getByRole('button', { name: 'Ver los productos de Distribuidora Central' }).click();

  const list = page.getByRole('dialog', { name: 'Productos de Distribuidora Central' });
  const rows = list.getByRole('table').locator('tbody tr');

  await expect(rows).toHaveCount(4);
  await list.getByLabel('Buscar producto del proveedor').fill('sal');
  await expect(rows).toHaveCount(1);
});

test('«Editar»: los productos se agregan buscando, van de 4 en 4 y se quitan', async ({ page }) => {
  await openSuppliers(page);
  await page
    .getByRole('row', { name: /Distribuidora Central/ })
    .getByRole('button', { name: 'Editar' })
    .click();

  const form = page.getByRole('dialog', { name: 'Editar proveedor' });
  const rows = form.getByRole('table', { name: 'Productos que suministra' }).locator('tbody tr');

  // Ninguna lista desplegable con todo el catálogo.
  await expect(form.getByRole('combobox')).toHaveCount(0);
  await expect(rows).toHaveCount(4);

  // Agregar uno que también vende, buscándolo: queda arriba con su costo actual.
  await form.getByLabel('Agregar producto que suministra').fill('mantequilla');
  await form
    .getByRole('list', { name: 'Productos encontrados' })
    .getByRole('button', { name: /MAN-01/ })
    .click();
  await expect(rows.first()).toContainText('Mantequilla 250 g');
  await expect(form.getByLabel('Costo de Mantequilla 250 g')).toHaveValue('1200.00');
  await form.getByLabel('Costo de Mantequilla 250 g').fill('1150');
  await saveEvidence(page, 'HU-21', 'editar-proveedor-productos.png');
  // El proveedor del ejemplo no tiene contacto, y el formulario lo pide.
  await form.getByLabel('Teléfono').fill('2222-1111');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(form).toHaveCount(0);
  expect(await linkedCodes()).toEqual(['MAN-01', 'P-01', 'P-02', 'P-03', 'P-04', 'P-05', 'P-06']);

  // Quitarlo (los de proveedor principal no se quitan aquí).
  await page
    .getByRole('row', { name: /Distribuidora Central/ })
    .getByRole('button', { name: 'Editar' })
    .click();
  await form.getByLabel('Buscar entre los productos del proveedor').fill('mantequilla');
  await form.getByRole('button', { name: 'Quitar Mantequilla 250 g' }).click();
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(form).toHaveCount(0);
  expect(await linkedCodes()).not.toContain('MAN-01');
});
