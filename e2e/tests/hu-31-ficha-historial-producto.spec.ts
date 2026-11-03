import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { insertUser } from '../support/db';
import { BACKEND_URL, FRONTEND_URL } from '../support/env';
import { saveEvidence } from '../support/evidence';
import {
  E2E_ADMIN,
  resetCatalog,
  seedProducts,
  signInAsOwner,
  signInVia,
} from '../support/fixtures';
import {
  BODEGA,
  CAJERO,
  OTHER_OWNER,
  inventoryState,
  openAs,
  productIdOf,
  readHistory,
  seedBulkMovements,
  seedMovements,
  seedOtherBusiness,
  seedSaleRow,
  trackRuntimeErrors,
} from '../support/kardex';

/**
 * HU-31 — Ver ficha e historial de producto (issue #31). Navegador real + backend
 * real + PostgreSQL de pruebas. Los movimientos tienen fechas fijas (mayo de 2024,
 * hora de Costa Rica) para que los resultados no dependan del día en que corra.
 *
 * Criterios: (1) la ficha muestra código, categoría, precio, costo y proveedor;
 * (2) se lista el historial; (3) se llega desde el listado o la búsqueda; (4) del
 * más reciente al más antiguo; (5) carga completa sin bloquear; (6) sin movimientos,
 * un mensaje.
 */

const HISTORY_EMPTY = 'No hay historial disponible para este producto.';

/** Los dígitos de un importe en pantalla (`₡1 000,50` → `100050`). */
const digits = (text: string | null) => (text ?? '').replace(/\D/g, '');

let coffeeId = '';

test.beforeEach(async ({ page }) => {
  await signInAsOwner(page);
  await resetCatalog();
  await seedProducts([
    {
      code: 'P001',
      name: 'Café molido 500 g',
      category: 'Bebidas',
      price: '1500.00',
      cost: '1000.50',
      stock: 8,
      supplier: 'Distribuidora Central',
      barcode: '7501000000012',
    },
    {
      code: 'P002',
      name: 'Arroz 1 kg',
      category: 'Granos',
      price: '900.00',
      cost: '700.00',
      stock: 0,
      supplier: null,
    },
    {
      code: 'P003',
      name: 'Producto descontinuado',
      category: 'Granos',
      price: '100.00',
      cost: '50.00',
      stock: 2,
      supplier: 'Granos del Valle',
      isActive: false,
    },
    {
      code: 'P004',
      name: 'Gaseosa 2 L',
      category: 'Bebidas',
      price: '1800.00',
      cost: '1200.00',
      stock: 60,
      supplier: null,
    },
  ]);

  const firstSale = await seedSaleRow('2024-05-02T10:30:00', '7500.00');
  const secondSale = await seedSaleRow('2024-05-06T14:20:00', '7500.00');

  // Entra, sale, ajusta hacia arriba, ajusta hacia abajo, se devuelve y vuelve a salir: 0 → 8.
  await seedMovements('P001', [
    {
      type: 'ENTRY',
      quantity: 20,
      stockBefore: 0,
      stockAfter: 20,
      at: '2024-05-01T08:00:00',
      reason: 'Stock inicial',
    },
    {
      type: 'EXIT',
      quantity: 5,
      stockBefore: 20,
      stockAfter: 15,
      at: '2024-05-02T10:30:00',
      reason: 'Venta #1',
      saleId: firstSale,
    },
    {
      type: 'ADJUSTMENT',
      quantity: 3,
      stockBefore: 15,
      stockAfter: 18,
      at: '2024-05-03T09:15:00',
      reason: 'Conteo físico',
    },
    {
      type: 'ADJUSTMENT',
      quantity: 6,
      stockBefore: 18,
      stockAfter: 12,
      at: '2024-05-04T16:45:00',
      reason: 'Conteo físico',
    },
    {
      type: 'ENTRY',
      quantity: 1,
      stockBefore: 12,
      stockAfter: 13,
      at: '2024-05-05T11:00:00',
      reason: 'Devolución venta #1: Empaque dañado',
      saleId: firstSale,
    },
    {
      type: 'EXIT',
      quantity: 5,
      stockBefore: 13,
      stockAfter: 8,
      at: '2024-05-06T14:20:00',
      reason: 'Venta #2',
      saleId: secondSale,
    },
  ]);
  await seedMovements('P003', [
    {
      type: 'ENTRY',
      quantity: 2,
      stockBefore: 0,
      stockAfter: 2,
      at: '2024-04-01T09:00:00',
      reason: 'Stock inicial',
    },
  ]);
  await seedBulkMovements('P004', 60);
  coffeeId = await productIdOf('P001');
});

/** Entra a Inventario, busca el producto, lo marca y abre su ficha con «Ver ficha». */
async function openFromInventory(page: Page, search: string, code: string): Promise<void> {
  await page.goto('/inventory');
  await page.getByLabel('Buscar producto por nombre o código').fill(search);
  await expect(page.getByRole('row', { name: new RegExp(code) })).toBeVisible();
  await page.getByRole('row', { name: new RegExp(code) }).click();
  await page.getByRole('button', { name: /Ver ficha/ }).click();
}

const SHEET = 'Ficha de Café molido 500 g';

test('desde la búsqueda de Inventario abre la ficha con sus datos y el historial ordenado, y deja la evidencia', async ({
  page,
}) => {
  const errors = trackRuntimeErrors(page);

  await openFromInventory(page, 'molido', 'P001');

  // Criterio 3: se llega desde la búsqueda y la dirección lleva el producto.
  await expect(page).toHaveURL(new RegExp(`/kardex\\?productId=${coffeeId}$`));

  // Criterio 1: código, categoría, precio, costo, proveedor (y stock).
  const sheet = page.getByRole('region', { name: SHEET });

  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('heading', { name: /Café molido 500 g/ })).toContainText('Activo');
  await expect(
    sheet.locator('dt', { hasText: 'Código' }).first().locator('xpath=following-sibling::dd'),
  ).toHaveText('P001');
  await expect(
    sheet.locator('dt', { hasText: 'Código de barras' }).locator('xpath=following-sibling::dd'),
  ).toHaveText('7501000000012');
  await expect(
    sheet.locator('dt', { hasText: 'Categoría' }).locator('xpath=following-sibling::dd'),
  ).toHaveText('Bebidas');
  await expect(
    sheet.locator('dt', { hasText: 'Proveedor principal' }).locator('xpath=following-sibling::dd'),
  ).toHaveText('Distribuidora Central');

  const tile = (label: string) =>
    sheet.locator('.stat-tile', { hasText: label }).locator('.stat-tile__value');

  expect(digits(await tile('Precio de venta').textContent())).toBe('150000');
  expect(digits(await tile('Costo').textContent())).toBe('100050');
  await expect(tile('Stock actual')).toHaveText('8');

  // Criterios 2 y 4: todo el historial, del más reciente al más antiguo, con su saldo.
  // [fecha, concepto, documento, entrada, salida, stock anterior, stock final]
  expect(await readHistory(page)).toEqual([
    ['06/05/2024 14:20', 'Venta #2', 'Venta #2', '—', '5', '13', '8'],
    ['05/05/2024 11:00', 'Devolución venta #1: Empaque dañado', 'Venta #1', '1', '—', '12', '13'],
    ['04/05/2024 16:45', 'Conteo físico', '—', '—', '6', '18', '12'],
    ['03/05/2024 09:15', 'Conteo físico', '—', '3', '—', '15', '18'],
    ['02/05/2024 10:30', 'Venta #1', 'Venta #1', '—', '5', '20', '15'],
    ['01/05/2024 08:00', 'Stock inicial', '—', '20', '—', '0', '20'],
  ]);
  await expect(page.getByText('6 movimientos')).toBeVisible();
  await expect(page.getByText('Página 1 de 1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Anterior' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  await expect(page.getByRole('link', { name: /Volver a Inventario/ })).toBeVisible();

  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await saveEvidence(page, 'HU-31', 'HU-31-ficha-historial-producto.png');
});

test('el ajuste que baja el stock es una salida y el que lo sube es una entrada; el saldo encadena', async ({
  page,
}) => {
  await page.goto(`/kardex?productId=${coffeeId}`);

  const rows = await readHistory(page);

  // De más antiguo a más reciente, cada movimiento parte de donde terminó el anterior.
  const chronological = [...rows].reverse();

  chronological.forEach((row, index) => {
    if (index > 0) {
      expect(row[5], `fila ${index + 1}`).toBe(chronological[index - 1]?.[6]);
    }
  });
  // Los dos conteos son del mismo tipo (ajuste): uno sube y otro baja.
  const counts = rows.filter((row) => row[1] === 'Conteo físico');

  expect(counts.map((row) => [row[3], row[4]])).toEqual([
    ['—', '6'],
    ['3', '—'],
  ]);
  // El stock final del último movimiento es el stock actual de la ficha.
  expect(rows[0]?.[6]).toBe('8');
});

test('doble clic sigue abriendo la edición y «Ver ficha» pide primero elegir un producto', async ({
  page,
}) => {
  await page.goto('/inventory');
  await expect(page.getByRole('row', { name: /P001/ })).toBeVisible();

  // Sin producto marcado: aviso claro, no navega.
  await page.getByRole('button', { name: /Ver ficha/ }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Primero seleccione en la lista el producto a consultar.' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/inventory$/);

  // El doble clic de siempre: abre la edición del producto.
  await page.getByRole('row', { name: /P001/ }).dblclick();

  const dialog = page.getByRole('dialog', { name: 'Modificar producto' });

  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();

  // Y marcar la fila con un clic simple sigue funcionando junto con «Ver ficha».
  await page.getByRole('row', { name: /P001/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Seleccionado: P001' })).toBeVisible();
  await page.getByRole('button', { name: /Ver ficha/ }).click();
  await expect(page.getByRole('region', { name: SHEET })).toBeVisible();
});

test('un producto sin movimientos muestra su ficha y el mensaje de que no hay historial', async ({
  page,
}) => {
  // Sin producto en la dirección: aparece el selector, con búsqueda.
  await page.goto('/kardex');
  await expect(page.getByRole('heading', { name: 'Elegir un producto' })).toBeVisible();
  await page.getByLabel('Buscar producto por nombre o código').fill('arroz');
  await page.getByRole('button', { name: /P002 · Arroz 1 kg/ }).click();

  await expect(page).toHaveURL(/\/kardex\?productId=/);
  await expect(page.getByRole('region', { name: 'Ficha de Arroz 1 kg' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: HISTORY_EMPTY })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Movimientos del producto' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Ficha de Arroz 1 kg' })).toContainText(
    'Sin proveedor',
  );
});

test('un producto desactivado se abre desde «Desactivados» y conserva su historial', async ({
  page,
}) => {
  await page.goto('/inventory');
  await page.getByRole('button', { name: /Desactivados/ }).click();
  await page.getByRole('row', { name: /P003/ }).click();
  await page.getByRole('button', { name: /Ver ficha/ }).click();

  const sheet = page.getByRole('region', { name: 'Ficha de Producto descontinuado' });

  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('heading')).toContainText('Inactivo');
  await expect(sheet).toContainText('Granos del Valle');
  expect(await readHistory(page)).toEqual([
    ['01/04/2024 09:00', 'Stock inicial', '—', '2', '—', '0', '2'],
  ]);
});

test('el selector encuentra productos desactivados y permite cambiar de producto', async ({
  page,
}) => {
  await page.goto(`/kardex?productId=${coffeeId}`);
  await expect(page.getByRole('region', { name: SHEET })).toBeVisible();

  await page.getByRole('button', { name: 'Elegir otro producto' }).click();
  await page.getByLabel('Buscar producto por nombre o código').fill('descontinuado');
  await expect(page.getByRole('button', { name: /P003 · Producto descontinuado/ })).toContainText(
    'Inactivo',
  );
  await page.getByRole('button', { name: /P003/ }).click();

  await expect(page.getByRole('region', { name: 'Ficha de Producto descontinuado' })).toBeVisible();
  // El historial mostrado es el del producto nuevo, no el anterior.
  expect((await readHistory(page)).map((row) => row[1])).toEqual(['Stock inicial']);
});

test('un historial de más de una página se recorre completo, sin repetir ni omitir movimientos', async ({
  page,
}) => {
  await page.goto(`/kardex?productId=${await productIdOf('P004')}`);
  await expect(page.getByText('60 movimientos')).toBeVisible();
  await expect(page.getByText('Página 1 de 3')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Anterior' })).toBeDisabled();

  const concepts: string[] = [];
  const first = await readHistory(page);

  expect(first).toHaveLength(25);
  // El más reciente primero.
  expect(first[0]?.[1]).toBe('Movimiento 60');
  // Sembrado a las 13:00 UTC: en hora de Costa Rica son las 07:00.
  expect(first[0]?.[0]).toBe('01/06/2024 07:00');
  concepts.push(...first.map((row) => row[1] ?? ''));

  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByText('Página 2 de 3')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Movimiento 35', exact: true })).toBeVisible();
  const second = await readHistory(page);

  expect(second).toHaveLength(25);
  concepts.push(...second.map((row) => row[1] ?? ''));

  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByText('Página 3 de 3')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  const third = await readHistory(page);

  expect(third).toHaveLength(10);
  expect(third.at(-1)?.[1]).toBe('Movimiento 1');
  concepts.push(...third.map((row) => row[1] ?? ''));

  // Los 60, una sola vez cada uno, del 60 al 1.
  expect(concepts).toEqual(Array.from({ length: 60 }, (_, index) => `Movimiento ${60 - index}`));

  // Y se puede volver atrás.
  await page.getByRole('button', { name: 'Anterior' }).click();
  await expect(page.getByText('Página 2 de 3')).toBeVisible();
});

test('la ficha se ve y la pantalla responde aunque el historial tarde en llegar', async ({
  page,
}) => {
  // La respuesta es la REAL del servidor; solo se la retrasa 2 s para observar la espera.
  await page.route('**/api/kardex/products/*/movements*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.continue();
  });

  await page.goto(`/kardex?productId=${coffeeId}`);

  // Criterio 5: la ficha ya está, el historial se anuncia como «cargando» y la página responde.
  await expect(page.getByRole('region', { name: SHEET })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Cargando historial…' })).toBeVisible();
  await page.getByRole('button', { name: 'Elegir otro producto' }).click();
  await expect(page.getByRole('heading', { name: 'Elegir un producto' })).toBeVisible();

  // Al llegar, el historial completo aparece.
  await expect(page.getByRole('table', { name: 'Movimientos del producto' })).toBeVisible({
    timeout: 10_000,
  });
  expect(await readHistory(page)).toHaveLength(6);
});

test('direcciones inválidas o de otro negocio muestran un error claro sin revelar datos ajenos', async ({
  page,
}) => {
  const foreignId = await seedOtherBusiness();

  // Id con forma inválida: se rechaza antes de pedirlo al servidor.
  await page.goto('/kardex?productId=no-es-un-id');
  await expect(page.getByRole('alert')).toContainText(
    'El producto indicado en la dirección no es válido.',
  );
  await expect(page.getByRole('heading', { name: 'Elegir un producto' })).toBeVisible();

  // Id válido que no existe.
  await page.goto(`/kardex?productId=${randomUUID()}`);
  await expect(page.getByRole('alert')).toContainText(
    'El producto no existe o ya no está disponible.',
  );
  await expect(page.getByRole('heading', { name: 'Elegir un producto' })).toBeVisible();

  // Producto de OTRO negocio: igual que si no existiera.
  await page.goto(`/kardex?productId=${foreignId}`);
  await expect(page.getByRole('alert')).toContainText(
    'El producto no existe o ya no está disponible.',
  );
  await expect(page.getByText('Producto del negocio ajeno')).toHaveCount(0);
  await expect(page.getByText('Historial secreto ajeno')).toHaveCount(0);

  // Ni el selector ofrece productos de otro negocio.
  await page.getByLabel('Buscar producto por nombre o código').fill('ajeno');
  await expect(page.getByText('Ningún producto coincide con «ajeno».')).toBeVisible();

  // La API responde lo mismo para la ficha y para el historial.
  for (const path of [`products/${foreignId}`, `products/${foreignId}/movements`]) {
    const response = await page.request.get(`${BACKEND_URL}/api/kardex/${path}`);

    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain('Historial secreto ajeno');
  }
});

test('cada negocio ve solo su producto aunque compartan el código «P001»', async ({
  page,
  browser,
}) => {
  const foreignId = await seedOtherBusiness();
  const other = await openAs(browser, OTHER_OWNER);

  await other.page.goto(`/kardex?productId=${foreignId}`);
  await expect(
    other.page.getByRole('region', { name: 'Ficha de Producto del negocio ajeno' }),
  ).toBeVisible();
  expect((await readHistory(other.page)).map((row) => row[1])).toEqual(['Historial secreto ajeno']);

  // El otro dueño tampoco ve el producto del negocio de las pruebas.
  const foreign = await other.context.request.get(`${BACKEND_URL}/api/kardex/products/${coffeeId}`);

  expect(foreign.status()).toBe(404);
  await other.page.goto(`/kardex?productId=${coffeeId}`);
  await expect(other.page.getByRole('alert')).toContainText(
    'El producto no existe o ya no está disponible.',
  );
  await expect(other.page.getByText('Café molido 500 g')).toHaveCount(0);
  await other.context.close();

  await page.goto(`/kardex?productId=${coffeeId}`);
  await expect(page.getByRole('region', { name: SHEET })).toBeVisible();
});

async function statuses(request: APIRequestContext, productId: string): Promise<number[]> {
  return Promise.all(
    ['products', `products/${productId}`, `products/${productId}/movements`].map(async (path) =>
      (await request.get(`${BACKEND_URL}/api/kardex/${path}`)).status(),
    ),
  );
}

test('solo Encargado y Bodega usan el Kardex: Cajero, plataforma y sin sesión no', async ({
  page,
  browser,
  request,
}) => {
  await insertUser(CAJERO);
  await insertUser(BODEGA);

  // Sin sesión.
  expect(await statuses(request, coffeeId)).toEqual([401, 401, 401]);

  // La plataforma no accede a los datos de los negocios.
  await signInVia(request, E2E_ADMIN);
  expect(await statuses(request, coffeeId)).toEqual([403, 403, 403]);

  // Cajera: consulta el inventario, pero no ve «Ver ficha», ni el Kardex, ni su API.
  const cajera = await openAs(browser, CAJERO);

  expect(await statuses(cajera.context.request, coffeeId)).toEqual([403, 403, 403]);
  await cajera.page.goto('/inventory');
  await expect(cajera.page.getByRole('row', { name: /P001/ })).toBeVisible();
  await expect(cajera.page.getByRole('button', { name: /Ver ficha/ })).toHaveCount(0);
  await cajera.page.goto(`/kardex?productId=${coffeeId}`);
  await expect(cajera.page.getByRole('heading', { name: 'Acceso no permitido' })).toBeVisible();
  await expect(cajera.page.getByText('Café molido 500 g')).toHaveCount(0);
  await cajera.context.close();

  // Bodega: usa el Kardex completo, también desde el listado.
  const bodeguero = await openAs(browser, BODEGA);

  expect(await statuses(bodeguero.context.request, coffeeId)).toEqual([200, 200, 200]);
  await openFromInventory(bodeguero.page, 'molido', 'P001');
  await expect(bodeguero.page.getByRole('region', { name: SHEET })).toBeVisible();
  expect(await readHistory(bodeguero.page)).toHaveLength(6);
  await bodeguero.context.close();

  // La Encargada (sesión abierta en `beforeEach`) también.
  await page.goto(`/kardex?productId=${coffeeId}`);
  await expect(page.getByRole('region', { name: SHEET })).toBeVisible();
});

test('una venta real aparece en el historial y consultar el Kardex no cambia stock ni movimientos', async ({
  page,
}) => {
  // Venta REAL por la API de caja (HU-16): 2 unidades de P001, tarjeta.
  const sale = await page.request.post(`${BACKEND_URL}/api/sales`, {
    headers: { Origin: FRONTEND_URL },
    data: {
      idempotencyKey: randomUUID(),
      paymentMethod: 'CARD',
      items: [{ productId: coffeeId, quantity: 2 }],
    },
  });

  expect(sale.status()).toBe(201);

  const before = await inventoryState();

  await page.goto(`/kardex?productId=${coffeeId}`);
  await expect(
    page
      .getByRole('region', { name: SHEET })
      .locator('.stat-tile', { hasText: 'Stock actual' })
      .locator('.stat-tile__value'),
  ).toHaveText('6');

  const rows = await readHistory(page);

  // La venta nueva es el movimiento más reciente: 8 → 6 y queda enlazada a su venta (#3).
  expect(rows).toHaveLength(7);
  expect(rows[0]?.slice(1)).toEqual(['Venta #3', 'Venta #3', '—', '2', '8', '6']);

  // Recorrer fichas, historiales y el selector es solo lectura.
  await page.goto(`/kardex?productId=${await productIdOf('P004')}`);
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.goto('/kardex');
  await page.reload();

  expect(await inventoryState()).toEqual(before);
});
