import { expect, test } from '@playwright/test';
import { withDb } from '../support/db';
import { BACKEND_URL } from '../support/env';
import { resetCatalog, seedProducts, signInAsOwner } from '../support/fixtures';

/**
 * Organización de pantallas (docs/PANTALLAS.md): la pantalla abre con la
 * lista, el formulario se pide con un botón y abre en modal, y las listas
 * largas tienen buscador y páginas de 15.
 */

test.beforeEach(async ({ page }) => {
  await resetCatalog();
  await signInAsOwner(page);
});

test('Clientes: lista primero, formulario en modal, buscador sin tildes y páginas de 15', async ({
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

  await expect(table.getByRole('row')).toHaveCount(16); // encabezado + 15
  await expect(page.locator('#customer-name')).toHaveCount(0);
  await expect(page.getByText('Mostrando 1–15 de 24 clientes')).toBeVisible();

  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(table.getByRole('row')).toHaveCount(10); // encabezado + 9
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

test('Proveedores: buscador por proveedor o producto, y los productos en una ventana', async ({
  page,
}) => {
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

  // La celda solo dice cuántos son; la lista abre en una ventana y la fila no crece.
  const row = table.getByRole('row', { name: /Distribuidora Central/ });

  await expect(row).not.toContainText('Café molido 500 g');
  await row.getByRole('button', { name: 'Ver los productos de Distribuidora Central' }).click();

  const products = page.getByRole('dialog', { name: 'Productos de Distribuidora Central' });

  await expect(products.getByRole('row', { name: /P001.*Café molido 500 g/ })).toBeVisible();
  await expect(products.getByRole('row', { name: /P001/ })).toContainText('principal');
  await products.getByText('Cerrar', { exact: true }).click();
  await expect(products).toBeHidden();

  // Buscar por un producto que suministra encuentra al proveedor.
  await page.getByLabel('Buscar proveedores').fill('arroz');
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table).toContainText('Granos Oro');
});

test('Ventas: la caja y el historial del día van en pestañas separadas', async ({ page }) => {
  await page.goto('/sales');

  // Entra a la caja: solo lo necesario para vender.
  await expect(page.getByRole('tab', { name: 'Caja' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Código de barras o código del producto')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finalizar venta' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Historial de ventas' })).toHaveCount(0);

  // El historial, en su pestaña.
  await page.getByRole('tab', { name: 'Historial del día' }).click();
  await expect(page.getByRole('region', { name: 'Historial de ventas' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finalizar venta' })).toHaveCount(0);
});

test('Pedidos: «Ver pedido» abre el documento en una ventana sin mover la lista', async ({
  page,
}) => {
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
  ]);

  const ids = await withDb(async (client) => {
    const result = await client.query<{ productId: string; supplierId: string }>(
      `SELECT "productId", "supplierId" FROM "SupplierProduct" LIMIT 1`,
    );

    return result.rows[0]!;
  });
  const created = await page.request.post(`${BACKEND_URL}/api/purchase-orders`, {
    data: { supplierId: ids.supplierId, items: [{ productId: ids.productId, quantity: 6 }] },
  });

  expect(created.ok()).toBe(true);

  await page.goto('/orders');
  await page.getByRole('button', { name: 'Ver pedido PED-0001' }).click();

  const document = page.getByRole('dialog', { name: 'Pedido PED-0001 · Distribuidora Central' });

  await expect(document.getByRole('table', { name: 'Productos del pedido' })).toContainText(
    'Café molido 500 g',
  );
  await expect(document.getByRole('button', { name: /Imprimir \/ Guardar PDF/ })).toBeVisible();

  // La lista sigue en su lugar, detrás de la ventana.
  await expect(page.getByRole('table', { name: 'Historial de pedidos' })).toBeAttached();

  // La «×» también se llama «Cerrar»: el botón de abajo es el último.
  await document.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
  await expect(document).toHaveCount(0);
});

test('Pedidos: Pedidos y Proveedores son pestañas de una sola pantalla', async ({ page }) => {
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
  ]);

  await page.goto('/orders');
  const menu = page.getByRole('navigation', { name: 'Navegación principal' });

  // Una sola entrada en el menú: Proveedores ya no es una pantalla aparte.
  await expect(menu.getByRole('link', { name: /^›?\s*Pedidos$/ })).toBeVisible();
  await expect(menu.getByRole('link', { name: /Proveedores/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^›?\s*Pedidos$/);

  const tabs = page.getByRole('tablist', { name: 'Secciones de pedidos' });

  await expect(tabs.getByRole('tab')).toHaveText(['Pedidos', 'Proveedores']);
  await expect(tabs.getByRole('tab', { name: 'Pedidos' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: '+ Nuevo pedido' })).toBeVisible();

  // La pestaña Proveedores queda en la dirección y tiene todo lo de antes.
  await tabs.getByRole('tab', { name: 'Proveedores' }).click();
  await expect(page).toHaveURL(/\/orders\?seccion=proveedores$/);
  await expect(page.getByRole('table', { name: 'Proveedores' })).toContainText(
    'Distribuidora Central',
  );
  await expect(page.getByRole('button', { name: '+ Nuevo proveedor' })).toBeVisible();

  // La dirección vieja sigue sirviendo: lleva a la pestaña Proveedores.
  await page.goto('/suppliers');
  await expect(page).toHaveURL(/\/orders\?seccion=proveedores$/);
  await expect(tabs.getByRole('tab', { name: 'Proveedores' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
