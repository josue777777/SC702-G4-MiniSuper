import { expect, test, type Page } from '@playwright/test';
import { withDb } from '../support/db';
import { BACKEND_URL } from '../support/env';
import { evidencePath, saveEvidence } from '../support/evidence';
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

  await expect(order.getByText('Parcial', { exact: true })).toBeVisible();
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

/** Un PDF mínimo válido (la firma «%PDF-» es lo que revisa el servidor). */
const INVOICE_PDF = {
  name: 'Factura F-400.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
  ),
};

/** Una foto de 1 × 1 píxel (PNG). */
const INVOICE_PNG = {
  name: 'factura-foto.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
};

test('la factura del proveedor se adjunta al registrar la entrega y se ve al lado', async ({
  page,
}) => {
  await createOrder(page);
  await openOrder(page);
  await orderDialog(page).getByRole('button', { name: '📦 Registrar entrega' }).click();

  const receipt = receiptDialog(page);

  // Un archivo que no es factura se rechaza antes de subirlo.
  await receipt.getByLabel('Factura del proveedor (opcional)').setInputFiles({
    name: 'notas.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hola'),
  });
  await expect(receipt.getByRole('alert')).toHaveText(
    'Adjunte un PDF o una imagen (PNG, JPG o WEBP) de la factura.',
  );

  await receipt.getByLabel('Factura del proveedor (opcional)').setInputFiles(INVOICE_PDF);
  await expect(receipt.getByRole('figure', { name: 'Factura del proveedor' })).toBeVisible();
  await expect(receipt.locator('iframe[title="Factura: Factura F-400.pdf"]')).toBeVisible();
  await receipt.getByLabel('N.º de factura').fill('F-400');
  await saveEvidence(page, 'HU-38', 'registrar-entrega-con-factura.png');
  await receipt.getByRole('button', { name: 'Registrar y dejar la carga pendiente' }).click();
  await expect(receipt).toHaveCount(0);

  // En «Entregas»: «Ver factura proveedor» junto a «Cargar al inventario».
  const order = orderDialog(page);
  const row = order.getByRole('table', { name: 'Entregas del pedido' }).locator('tbody tr');

  await expect(
    row.getByRole('button', { name: 'Cargar al inventario la factura F-400' }),
  ).toBeVisible();
  await row.getByRole('button', { name: 'Ver factura del proveedor F-400' }).click();

  const viewer = page.getByRole('dialog', { name: 'Factura del proveedor · F-400' });

  await expect(viewer.locator('iframe[title="Factura: Factura F-400.pdf"]')).toBeVisible();
  await saveEvidence(page, 'HU-38', 'ver-factura-proveedor.png');
});

test('la factura se puede adjuntar después, desde «Entregas»', async ({ page }) => {
  await createOrder(page);
  await openOrder(page);
  await orderDialog(page).getByRole('button', { name: '📦 Registrar entrega' }).click();

  const receipt = receiptDialog(page);

  await receipt.getByLabel('N.º de factura').fill('F-500');
  await receipt.getByRole('button', { name: 'Registrar y cargar al inventario' }).click();
  await expect(receipt).toHaveCount(0);

  const order = orderDialog(page);

  await order.getByLabel('Adjuntar factura del proveedor F-500').setInputFiles(INVOICE_PNG);
  await expect(
    order.getByText('Factura del proveedor adjuntada a la entrega F-500.'),
  ).toBeVisible();
  await order.getByRole('button', { name: 'Ver factura del proveedor F-500' }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Factura del proveedor · F-500' })
      .getByRole('img', { name: 'Factura: factura-foto.png' }),
  ).toBeVisible();
});

test('el historial se filtra por estado, período y búsqueda (pedido, factura o producto)', async ({
  page,
}) => {
  await createOrder(page);
  await createOrder(page);
  await openOrder(page);
  await orderDialog(page).getByRole('button', { name: '📦 Registrar entrega' }).click();
  await receiptDialog(page).getByLabel('N.º de factura').fill('F-777');
  await receiptDialog(page).getByLabel('Llegó de Arroz blanco 1 kg').fill('2');
  await receiptDialog(page)
    .getByRole('button', { name: 'Registrar y dejar la carga pendiente' })
    .click();
  await expect(receiptDialog(page)).toHaveCount(0);
  await orderDialog(page).getByText('Cerrar', { exact: true }).click();

  const history = page.getByRole('table', { name: 'Historial de pedidos' });
  const filters = page.getByRole('search', { name: 'Filtros del historial de pedidos' });

  await expect(history.locator('tbody tr')).toHaveCount(2);

  await filters.getByLabel('Estado').selectOption({ label: 'Parciales' });
  await expect(history.locator('tbody tr')).toHaveCount(1);
  await expect(history).toContainText('PED-0001');
  await expect(page.getByText('1 de 2 pedidos')).toBeVisible();

  await filters.getByLabel('Estado').selectOption({ label: 'Con carga pendiente' });
  await expect(history.locator('tbody tr')).toHaveCount(1);

  await filters.getByLabel('Estado').selectOption({ label: 'Pendientes' });
  await expect(history).toContainText('PED-0002');
  await expect(history).not.toContainText('PED-0001');

  // Buscar por la factura de una entrega.
  await filters.getByRole('button', { name: 'Limpiar filtros' }).click();
  await filters.getByRole('searchbox').fill('F-777');
  await expect(history.locator('tbody tr')).toHaveCount(1);
  await expect(history).toContainText('PED-0001');

  // Un período sin pedidos.
  await filters.getByRole('button', { name: 'Limpiar filtros' }).click();
  await filters.getByLabel('Hasta').fill('2020-01-01');
  await expect(page.getByText('Ningún pedido cumple los filtros.')).toBeVisible();
  await saveEvidence(page, 'HU-38', 'historial-filtros.png');
});

test('cancelar el selector de archivos no cierra la ventana; Esc sí', async ({ page }) => {
  await createOrder(page);
  await openOrder(page);
  await orderDialog(page).getByRole('button', { name: '📦 Registrar entrega' }).click();
  await receiptDialog(page).getByLabel('N.º de factura').fill('F-900');
  await receiptDialog(page)
    .getByRole('button', { name: 'Registrar y cargar al inventario' })
    .click();
  await expect(receiptDialog(page)).toHaveCount(0);

  // El navegador avisa «cancel» (y sube por la página) al cerrar el selector sin elegir.
  await orderDialog(page)
    .getByLabel('Adjuntar factura del proveedor F-900')
    .evaluate((input) => input.dispatchEvent(new Event('cancel', { bubbles: true })));
  await expect(orderDialog(page)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(orderDialog(page)).toHaveCount(0);
});

test('«Ver pedido» en pantalla es información; el papel lleva el negocio, la firma y quién lo generó', async ({
  page,
}) => {
  await withDb((client) =>
    client.query(
      `UPDATE "Business" SET "legalId" = '3-101-123456', phone = '2222-0000',
         email = 'ventas@nuevoamanecer.example.com', address = 'San José, Costa Rica'
       WHERE name = 'Abastecedor Nuevo Amanecer'`,
    ),
  );
  await createOrder(page);
  await openOrder(page);

  const order = orderDialog(page);

  await expect(order.getByRole('heading', { name: 'Productos' })).toBeVisible();
  // La constancia y el pie (los dos dicen «Generado por») no se ven en pantalla.
  await expect(order.locator('.order-reception')).toBeHidden();
  await expect(order.locator('.business-document__footer')).toBeHidden();
  await expect(order.getByText('Al recibir la mercadería', { exact: false })).toBeHidden();
  // Nada llegó todavía: en pantalla «Cant. recibida» dice 0.
  await expect(
    order.getByRole('table', { name: 'Productos del pedido' }).locator('tbody tr').first(),
  ).toContainText('0');

  // Al imprimir (o guardar en PDF) solo queda el papel (`.print-area`).
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => document.body.classList.add('printing-report'));

  const paper = page.locator('.print-area');
  const header = paper.locator('.business-document__header');
  const footer = paper.locator('.business-document__footer');

  await expect(header).toContainText('Abastecedor Nuevo Amanecer');
  await expect(header).toContainText('Céd. 3-101-123456 · Tel. 2222-0000');
  await expect(header).toContainText('Pedido a proveedor PED-0001');
  await expect(paper.locator('.order-reception')).toContainText('Dueña de Prueba');
  await expect(paper.locator('.order-reception')).toContainText('Generado por');
  await expect(paper.locator('.order-reception')).toContainText('Firma');
  await expect(footer).toContainText('Generado por Dueña de Prueba');
  await expect(paper.getByText('Productos', { exact: true })).toBeHidden();
  await page.pdf({ path: evidencePath('HU-38', 'pedido-a-proveedor.pdf'), format: 'Letter' });
});
