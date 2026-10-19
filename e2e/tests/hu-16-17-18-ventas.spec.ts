import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { withDb } from '../support/db';
import { BACKEND_URL } from '../support/env';
import { saveEvidence } from '../support/evidence';
import {
  countExitMovements,
  ensureOwner,
  readSales,
  resetCatalog,
  seedCustomer,
  seedProducts,
  stockOf,
} from '../support/fixtures';

/**
 * HU-16, HU-17 y HU-18 — Caja: venta con código de barras, método de pago y fiado
 * (issues #17, #18 y #19). Navegador real + backend real + PostgreSQL de pruebas.
 *
 * El lector físico NO se prueba aquí: se simula la escritura rápida de teclado
 * (keyboard wedge) con Playwright. Eso valida el adaptador, no el hardware.
 */

const CODE = {
  coffee: '7501000000011',
  rice: '7501000000028',
  milk: '7501000000035',
  inactive: '7501000000059',
};

test.beforeEach(async ({ request }) => {
  await ensureOwner(request);
  await resetCatalog();
  await seedProducts([
    {
      code: 'P001',
      barcode: CODE.coffee,
      name: 'Café molido 500 g',
      category: 'Bebidas',
      price: '1500.00',
      cost: '1000.00',
      stock: 10,
      supplier: null,
    },
    {
      code: 'P002',
      barcode: CODE.rice,
      name: 'Arroz 1 kg',
      category: 'Granos',
      price: '900.00',
      cost: '700.00',
      stock: 5,
      supplier: null,
    },
    {
      code: 'P003',
      barcode: CODE.milk,
      name: 'Leche entera 1 L',
      category: 'Lácteos',
      price: '2500.00',
      cost: '1800.00',
      stock: 20,
      supplier: null,
    },
    {
      code: 'P004',
      name: 'Producto único',
      category: 'Granos',
      price: '1000.00',
      cost: '600.00',
      stock: 1,
      supplier: null,
    },
    {
      code: 'P005',
      barcode: CODE.inactive,
      name: 'Producto descontinuado',
      category: 'Granos',
      price: '500.00',
      cost: '300.00',
      stock: 3,
      supplier: null,
      isActive: false,
    },
  ]);
});

async function openSales(page: Page): Promise<void> {
  await page.goto('/sales');
  await expect(page.getByRole('heading', { name: 'Ventas', level: 1 })).toBeVisible();
}

/** Escribe un código en el campo y presiona Enter, como lo haría el lector o el cajero. */
async function scanInField(page: Page, code: string): Promise<void> {
  await page.getByLabel('Código de barras o código del producto').fill(code);
  await page.keyboard.press('Enter');
}

async function addByField(page: Page, code: string, name: string): Promise<void> {
  await scanInField(page, code);
  await expect(page.getByRole('table', { name: 'Productos de la venta' })).toContainText(name);
}

/** Tras confirmar, el comprobante (HU-34) se abre solo: se cierra para seguir con la caja. */
async function closeReceipt(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Comprobante de venta' });

  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
  await expect(dialog).toHaveCount(0);
}

test.describe('HU-16 — venta con código de barras', () => {
  test('escanea varios productos, cambia cantidades, recalcula el total y confirma la venta', async ({
    page,
  }) => {
    await openSales(page);
    await expect(page.getByText('El carrito está vacío')).toBeVisible();

    // 1) Lector simulado como teclado: foco fuera de los campos de texto y ráfaga rápida + Enter.
    await page.getByRole('heading', { name: 'Ventas', level: 1 }).click();
    await page.keyboard.type(CODE.coffee);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('table', { name: 'Productos de la venta' })).toContainText(
      'Café molido 500 g',
    );

    // 2) Por el campo (o a mano): un segundo producto y repetir el primero suma cantidad.
    await addByField(page, CODE.rice, 'Arroz 1 kg');
    await addByField(page, 'P001', 'Café molido 500 g');
    await expect(page.getByLabel('Cantidad de Café molido 500 g')).toHaveValue('2');
    await expect(page.getByTestId('cart-total')).toContainText(/3\s900,00/); // 2×1500 + 900

    // 3) Modificar la cantidad recalcula el total.
    await page.getByLabel('Cantidad de Arroz 1 kg').fill('3');
    await expect(page.getByTestId('cart-total')).toContainText(/5\s700,00/); // 3000 + 2700
    await saveEvidence(page, 'HU-16', 'HU-16-carrito-productos.png');

    // 4) Confirmar con tarjeta.
    await page.getByRole('radio', { name: 'Tarjeta' }).check();
    await page.getByRole('button', { name: 'Finalizar venta' }).click();

    const confirmed = page.getByRole('region', { name: 'Venta confirmada' });

    await expect(confirmed).toContainText('Venta #');
    await expect(confirmed).toContainText(/5\s700,00/);
    await expect(page.getByText('El carrito está vacío')).toBeVisible();
    await closeReceipt(page);
    await saveEvidence(page, 'HU-16', 'HU-16-venta-confirmada.png');

    // Persistencia: venta, stock real y movimientos EXIT asociados a la venta.
    const sales = await readSales();

    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ paymentMethod: 'CARD', total: '5700.00' });
    expect(await stockOf('P001')).toBe(8);
    expect(await stockOf('P002')).toBe(2);
    expect(await countExitMovements()).toBe(2);

    const lines = await withDb(async (client) => {
      const result = await client.query(
        `SELECT p.code, i.quantity, i."unitPrice"::text AS price FROM "SaleItem" i JOIN "Product" p ON p.id = i."productId" ORDER BY p.code`,
      );

      return result.rows;
    });

    expect(lines).toEqual([
      { code: 'P001', quantity: 2, price: '1500.00' },
      { code: 'P002', quantity: 3, price: '900.00' },
    ]);
  });

  test('rechaza códigos inexistentes, inválidos y productos desactivados', async ({ page }) => {
    await openSales(page);

    await scanInField(page, '9999999999999');
    await expect(
      page.getByRole('status').filter({ hasText: 'No existe un producto' }),
    ).toBeVisible();

    await scanInField(page, 'AB$%');
    await expect(page.getByRole('status').filter({ hasText: 'Código inválido' })).toBeVisible();

    await scanInField(page, CODE.inactive);
    await expect(page.getByRole('status').filter({ hasText: 'desactivado' })).toBeVisible();

    await expect(page.getByText('El carrito está vacío')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finalizar venta' })).toBeDisabled();
  });

  test('no deja agregar más unidades que el stock', async ({ page }) => {
    await openSales(page);

    await addByField(page, 'P004', 'Producto único');
    await scanInField(page, 'P004');

    await expect(page.getByRole('status').filter({ hasText: 'Stock insuficiente' })).toBeVisible();
    await expect(page.getByLabel('Cantidad de Producto único')).toHaveValue('1');
  });

  test('si el stock se agota antes de confirmar, el servidor rechaza y no queda nada a medias', async ({
    page,
  }) => {
    await openSales(page);
    await addByField(page, CODE.rice, 'Arroz 1 kg');
    await page.getByLabel('Cantidad de Arroz 1 kg').fill('4');

    // Otra caja vende casi todo el arroz mientras esta venta sigue abierta.
    await withDb((client) => client.query(`UPDATE "Product" SET stock = 2 WHERE code = 'P002'`));

    await page.getByRole('radio', { name: 'Tarjeta' }).check();
    await page.getByRole('button', { name: 'Finalizar venta' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'Stock insuficiente' })).toBeVisible();
    expect(await readSales()).toHaveLength(0);
    expect(await stockOf('P002')).toBe(2);
    expect(await countExitMovements()).toBe(0);
    await saveEvidence(page, 'HU-16', 'HU-16-stock-insuficiente.png');
  });

  test('doble clic en Finalizar venta registra una sola venta', async ({ page }) => {
    await openSales(page);
    await addByField(page, CODE.coffee, 'Café molido 500 g');
    await page.getByRole('radio', { name: 'Tarjeta' }).check();

    await page.getByRole('button', { name: 'Finalizar venta' }).dblclick();

    await expect(page.getByRole('region', { name: 'Venta confirmada' })).toBeVisible();
    expect(await readSales()).toHaveLength(1);
    expect(await stockOf('P001')).toBe(9);
  });

  test('dos ventas simultáneas del último producto: una se confirma y la otra se rechaza', async ({
    request,
  }) => {
    const idForLastUnit = await withDb(async (client) => {
      const result = await client.query<{ id: string }>(
        `SELECT id FROM "Product" WHERE code = 'P004'`,
      );

      return result.rows[0]?.id ?? '';
    });
    const send = () =>
      request.post(`${BACKEND_URL}/api/sales`, {
        data: {
          idempotencyKey: randomUUID(),
          items: [{ productId: idForLastUnit, quantity: 1 }],
          paymentMethod: 'CARD',
        },
      });

    const statuses = (await Promise.all([send(), send(), send()])).map((response) =>
      response.status(),
    );

    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(2);
    expect(await stockOf('P004')).toBe(0);
    expect(await readSales()).toHaveLength(1);
  });

  test('reintentar la misma confirmación (misma llave) no duplica la venta', async ({
    request,
  }) => {
    const productId = await withDb(async (client) => {
      const result = await client.query<{ id: string }>(
        `SELECT id FROM "Product" WHERE code = 'P001'`,
      );

      return result.rows[0]?.id ?? '';
    });
    const payload = {
      idempotencyKey: randomUUID(),
      items: [{ productId, quantity: 2 }],
      paymentMethod: 'CARD',
    };

    const first = await request.post(`${BACKEND_URL}/api/sales`, { data: payload });
    const retry = await request.post(`${BACKEND_URL}/api/sales`, { data: payload });

    expect(first.status()).toBe(201);
    expect(retry.status()).toBe(200);
    expect((await retry.json()).data.id).toBe((await first.json()).data.id);
    expect(await readSales()).toHaveLength(1);
    expect(await stockOf('P001')).toBe(8);
  });

  test('el servidor ignora los precios y totales enviados por el navegador', async ({
    request,
  }) => {
    const productId = await withDb(async (client) => {
      const result = await client.query<{ id: string }>(
        `SELECT id FROM "Product" WHERE code = 'P001'`,
      );

      return result.rows[0]?.id ?? '';
    });

    const response = await request.post(`${BACKEND_URL}/api/sales`, {
      data: {
        idempotencyKey: randomUUID(),
        items: [{ productId, quantity: 1, unitPrice: '1.00' }],
        total: '1.00',
        paymentMethod: 'CARD',
      },
    });

    expect(response.status()).toBe(201);
    expect((await response.json()).data.total).toBe('1500.00');
  });
});

test.describe('HU-17 — método de pago', () => {
  test('obliga a elegir el método; efectivo pide monto, calcula el cambio y rechaza montos menores', async ({
    page,
  }) => {
    await openSales(page);
    await addByField(page, CODE.coffee, 'Café molido 500 g');

    // Sin método seleccionado no se puede finalizar.
    await expect(page.getByRole('radio', { name: 'Efectivo' })).not.toBeChecked();
    await expect(page.getByRole('radio', { name: 'Tarjeta' })).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Finalizar venta' })).toBeDisabled();
    await expect(
      page.getByText('Seleccione el método de pago para finalizar la venta.'),
    ).toBeVisible();
    await saveEvidence(page, 'HU-17', 'HU-17-metodo-pago.png');

    // Efectivo insuficiente.
    await page.getByRole('radio', { name: 'Efectivo' }).check();
    await page.getByLabel('Monto recibido').fill('1000');
    await expect(page.getByRole('alert').filter({ hasText: 'no menor al total' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finalizar venta' })).toBeDisabled();

    // Efectivo suficiente: cambio.
    await page.getByLabel('Monto recibido').fill('2000');
    await expect(page.getByText('Cambio a devolver:')).toContainText(/500,00/);
    await expect(page.getByRole('button', { name: 'Finalizar venta' })).toBeEnabled();
    await saveEvidence(page, 'HU-17', 'HU-17-cambio-efectivo.png');

    await page.getByRole('button', { name: 'Finalizar venta' }).click();

    const confirmed = page.getByRole('region', { name: 'Venta confirmada' });

    await expect(confirmed).toContainText('Efectivo');
    await expect(confirmed).toContainText('Cambio');
    const sales = await readSales();

    expect(sales[0]).toMatchObject({
      paymentMethod: 'CASH',
      total: '1500.00',
      cashReceived: '2000.00',
    });
  });

  test('tarjeta guarda CARD sin pedir cambio, y el historial filtra por método', async ({
    page,
  }) => {
    await openSales(page);

    // Venta en efectivo.
    await addByField(page, CODE.coffee, 'Café molido 500 g');
    await page.getByRole('radio', { name: 'Efectivo' }).check();
    await page.getByLabel('Monto recibido').fill('1500');
    await page.getByRole('button', { name: 'Finalizar venta' }).click();
    await closeReceipt(page);
    await expect(page.getByRole('region', { name: 'Venta confirmada' })).toBeVisible();

    // Venta con tarjeta.
    await addByField(page, CODE.rice, 'Arroz 1 kg');
    await page.getByRole('radio', { name: 'Tarjeta' }).check();
    await expect(page.getByLabel('Monto recibido')).toHaveCount(0);
    await page.getByRole('button', { name: 'Finalizar venta' }).click();
    await expect(page.getByRole('region', { name: 'Venta confirmada' })).toContainText('Tarjeta');
    await closeReceipt(page);

    expect((await readSales()).map((sale) => sale.paymentMethod)).toEqual(['CASH', 'CARD']);

    // Filtro del historial.
    const history = page.getByRole('table', { name: 'Historial de ventas' });

    await expect(history.getByRole('row')).toHaveCount(3); // encabezado + 2 ventas
    await page.getByLabel('Filtrar por método de pago').selectOption('CARD');
    await expect(history.getByRole('row')).toHaveCount(2);
    await expect(history).toContainText('Tarjeta');
    await expect(history).not.toContainText('Efectivo');
    await page.getByLabel('Filtrar por método de pago').selectOption('CREDIT');
    await expect(page.getByText('No hay ventas pagadas con fiado.')).toBeVisible();
    await page.getByLabel('Filtrar por método de pago').selectOption('CASH');
    await expect(history).toContainText('Efectivo');
    await saveEvidence(page, 'HU-17', 'HU-17-historial-filtrado.png');
  });
});

test.describe('HU-18 — venta a crédito (fiado)', () => {
  test('exige cliente, muestra la deuda previa y acumula: ₡5 000 + ₡2 500 = ₡7 500', async ({
    page,
  }) => {
    await seedCustomer('Doña Marta', '5000.00');
    await openSales(page);
    await addByField(page, CODE.milk, 'Leche entera 1 L'); // ₡2 500

    // Sin cliente no se puede fiar.
    await page.getByRole('radio', { name: 'Fiado' }).check();
    await expect(page.getByRole('button', { name: 'Finalizar venta' })).toBeDisabled();

    await page.getByLabel('Cliente', { exact: true }).selectOption({ label: 'Doña Marta' });
    await expect(page.getByLabel('Saldo del cliente')).toContainText(/5\s000,00/);
    await expect(page.getByLabel('Saldo del cliente')).toContainText(/7\s500,00/);
    await expect(page.getByRole('button', { name: 'Finalizar venta' })).toBeEnabled();
    await saveEvidence(page, 'HU-18', 'HU-18-venta-fiado.png');

    await page.getByRole('button', { name: 'Finalizar venta' }).click();

    const confirmed = page.getByRole('region', { name: 'Venta confirmada' });

    await expect(confirmed).toContainText('Fiado');
    await expect(confirmed).toContainText('Doña Marta');
    await expect(page.getByTestId('customer-balance')).toContainText(/7\s500,00/);
    await closeReceipt(page);
    await saveEvidence(page, 'HU-18', 'HU-18-deuda-acumulada.png');

    // Persistencia: venta CREDIT con cliente, stock descontado y movimiento.
    const sales = await readSales();

    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ paymentMethod: 'CREDIT', total: '2500.00' });
    expect(sales[0]?.customerId).not.toBeNull();
    expect(await stockOf('P003')).toBe(19);
    expect(await countExitMovements()).toBe(1);

    // Dos fiados consecutivos: ₡7 500 + ₡2 500 = ₡10 000, y la pantalla de Clientes lo refleja.
    await page.getByRole('button', { name: 'Nueva venta' }).click();
    await addByField(page, CODE.milk, 'Leche entera 1 L');
    await page.getByRole('radio', { name: 'Fiado' }).check();
    await page.getByLabel('Cliente', { exact: true }).selectOption({ label: 'Doña Marta' });
    await expect(page.getByLabel('Saldo del cliente')).toContainText(/10\s000,00/);
    await page.getByRole('button', { name: 'Finalizar venta' }).click();
    await expect(page.getByTestId('customer-balance')).toContainText(/10\s000,00/);

    await page.goto('/customers');
    await expect(page.getByRole('table', { name: 'Clientes' })).toContainText(/10\s000,00/);
  });

  test('los abonos ya registrados se descuentan del saldo', async ({ page }) => {
    await seedCustomer('Don Pedro', '5000.00', '1500.50');
    await openSales(page);
    await addByField(page, CODE.rice, 'Arroz 1 kg'); // ₡900

    await page.getByRole('radio', { name: 'Fiado' }).check();
    await page.getByLabel('Cliente', { exact: true }).selectOption({ label: 'Don Pedro' });
    await expect(page.getByLabel('Saldo del cliente')).toContainText(/3\s499,50/); // 5000 − 1500.50
    await page.getByRole('button', { name: 'Finalizar venta' }).click();

    await expect(page.getByTestId('customer-balance')).toContainText(/4\s399,50/); // + 900
  });

  test('crea un cliente nuevo desde la caja y le fía', async ({ page }) => {
    await openSales(page);
    await addByField(page, CODE.coffee, 'Café molido 500 g');
    await page.getByRole('radio', { name: 'Fiado' }).check();

    await page.getByRole('button', { name: '+ Nuevo cliente' }).click();
    await page.getByRole('button', { name: 'Guardar cliente' }).click();
    await expect(page.getByText('Escriba el nombre del cliente.')).toBeVisible();

    await page.getByLabel('Nombre del cliente').fill('Cliente Nuevo');
    await page.getByLabel('Teléfono (opcional)').fill('8888-0000');
    await page.getByRole('button', { name: 'Guardar cliente' }).click();

    await expect(page.getByLabel('Cliente', { exact: true })).toHaveValue(/.+/);
    await expect(page.getByLabel('Saldo del cliente')).toContainText(/0,00/);
    await page.getByRole('button', { name: 'Finalizar venta' }).click();

    await expect(page.getByTestId('customer-balance')).toContainText(/1\s500,00/);
    expect((await readSales())[0]).toMatchObject({ paymentMethod: 'CREDIT', total: '1500.00' });
  });

  test('un cliente inexistente o inactivo es rechazado por el servidor y no se vende', async ({
    request,
  }) => {
    const productId = await withDb(async (client) => {
      const result = await client.query<{ id: string }>(
        `SELECT id FROM "Product" WHERE code = 'P001'`,
      );

      return result.rows[0]?.id ?? '';
    });
    const inactiveId = await withDb(async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO "Customer"(id, name, "isActive", "updatedAt") VALUES (gen_random_uuid(), 'Inactivo', false, now()) RETURNING id`,
      );

      return result.rows[0]?.id ?? '';
    });
    const sale = (customerId: string | undefined) =>
      request.post(`${BACKEND_URL}/api/sales`, {
        data: {
          idempotencyKey: randomUUID(),
          items: [{ productId, quantity: 1 }],
          paymentMethod: 'CREDIT',
          ...(customerId === undefined ? {} : { customerId }),
        },
      });

    expect((await sale(undefined)).status()).toBe(400);
    expect((await sale(randomUUID())).status()).toBe(404);
    expect((await sale(inactiveId)).status()).toBe(409);
    expect(await readSales()).toHaveLength(0);
    expect(await stockOf('P001')).toBe(10);
  });
});
