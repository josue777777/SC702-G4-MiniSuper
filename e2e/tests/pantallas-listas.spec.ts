import { expect, test } from '@playwright/test';
import { BACKEND_URL } from '../support/env';
import { resetCatalog, seedProducts, signInAsOwner } from '../support/fixtures';

/**
 * Organización de pantallas (docs/PANTALLAS.md): la pantalla abre con la
 * lista, el formulario se pide con un botón y abre en modal, y las listas
 * largas tienen buscador y páginas de 20.
 */

test.beforeEach(async ({ page }) => {
  await resetCatalog();
  await signInAsOwner(page);
});

test('Clientes: lista primero, formulario en modal, buscador sin tildes y páginas de 20', async ({
  page,
}) => {
  for (let index = 1; index <= 24; index += 1) {
    const response = await page.request.post(`${BACKEND_URL}/api/customers`, {
      data: { name: `Cliente ${String(index).padStart(2, '0')}`, phone: '' },
    });

    expect(response.ok()).toBe(true);
  }

  await page.goto('/customers');

  // Abre con la lista: el formulario no está a la vista.
  const table = page.getByRole('table', { name: 'Clientes' });

  await expect(table.getByRole('row')).toHaveCount(21); // encabezado + 20
  await expect(page.locator('#customer-name')).toHaveCount(0);
  await expect(page.getByText('Mostrando 1–20 de 24 clientes')).toBeVisible();

  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(table.getByRole('row')).toHaveCount(5); // encabezado + 4
  await expect(table).toContainText('Cliente 24');

  // Crear en el modal: valida, guarda y se cierra.
  await page.getByRole('button', { name: '+ Nuevo cliente' }).click();
  const modal = page.getByRole('dialog', { name: 'Nuevo cliente' });

  await modal.getByRole('button', { name: 'Guardar cliente' }).click();
  await expect(modal.getByRole('alert')).toContainText('Escriba el nombre del cliente.');
  await modal.getByLabel('Nombre').fill('José Pérez');
  await modal.getByRole('button', { name: 'Guardar cliente' }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Cliente "José Pérez" creado.');

  // Buscar sin tildes ni mayúsculas lo encuentra.
  await page.getByLabel('Buscar clientes').fill('JOSE');
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table).toContainText('José Pérez');
  await expect(page.getByText('1 de 25 cliente(s)')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Páginas de clientes' })).toHaveCount(0);

  await page.getByLabel('Buscar clientes').fill('nadie');
  await expect(page.getByText('Ningún cliente coincide con «nadie».')).toBeVisible();
});

test('Proveedores: buscador por proveedor o producto y productos plegados', async ({ page }) => {
  await seedProducts([
    {
      code: 'P001',
      name: 'Café molido 500 g',
      category: 'Abarrotes',
      price: '2500.00',
      cost: '1800.00',
      stock: 5,
      supplier: 'Distribuidora Central',
    },
    {
      code: 'P002',
      name: 'Arroz 1 kg',
      category: 'Abarrotes',
      price: '900.00',
      cost: '600.00',
      stock: 5,
      supplier: 'Granos Oro',
    },
  ]);

  await page.goto('/suppliers');
  const table = page.getByRole('table', { name: 'Proveedores' });

  // Los productos se ven al abrir el detalle, no de entrada.
  const row = table.getByRole('row', { name: /Distribuidora Central/ });

  await expect(row.getByText('P001 — Café molido 500 g')).toBeHidden();
  await row.getByText('1 producto').click();
  await expect(row.getByText('P001 — Café molido 500 g')).toBeVisible();

  // Buscar por un producto que suministra encuentra al proveedor.
  await page.getByLabel('Buscar proveedores').fill('arroz');
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table).toContainText('Granos Oro');
});
