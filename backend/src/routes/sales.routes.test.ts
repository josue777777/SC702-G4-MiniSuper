import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../middleware/error-handler.middleware.js';
import {
  COFFEE_ID,
  CUSTOMER_ID,
  FakeCustomersRepository,
  FakeSalesRepository,
  INACTIVE_CUSTOMER_ID,
  MISSING_ID,
  OFF_ID,
  RICE_ID,
} from '../testing/sales.repository.fake.js';
import { createCustomersRouter } from './customers.routes.js';
import { createSalesRouter } from './sales.routes.js';

/** Ventas, método de pago y fiado (HU-16, HU-17, HU-18): rutas reales con repositorios falsos. */

function buildApp() {
  const sales = new FakeSalesRepository();
  const customers = new FakeCustomersRepository(sales);
  const app = express();

  app.use(express.json());
  app.use('/api/sales', createSalesRouter(sales, customers));
  app.use('/api/customers', createCustomersRouter(customers));
  app.use(errorHandler);

  return { app, sales, customers };
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: randomUUID(),
    items: [{ productId: COFFEE_ID, quantity: 2 }],
    paymentMethod: 'CARD',
    ...overrides,
  };
}

describe('GET /api/sales/daily-summary (HU-37)', () => {
  it('devuelve ceros explícitos cuando todavía no hay ventas hoy', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/sales/daily-summary');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      saleCount: 0,
      total: '0.00',
      cash: '0.00',
      card: '0.00',
      credit: '0.00',
    });
  });

  it('suma con exactitud efectivo, tarjeta y fiados, y excluye ventas de otro día', async () => {
    const { app, sales } = buildApp();
    const cash = await request(app)
      .post('/api/sales')
      .send(body({ paymentMethod: 'CASH', cashReceived: '4000.00' }));
    const card = await request(app)
      .post('/api/sales')
      .send(body({ paymentMethod: 'CARD' }));
    const credit = await request(app)
      .post('/api/sales')
      .send(body({ paymentMethod: 'CREDIT', customerId: CUSTOMER_ID }));

    sales.sales.push({
      ...cash.body.data,
      id: randomUUID(),
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    });

    const response = await request(app).get('/api/sales/daily-summary');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      saleCount: 3,
      total: '9000.00',
      cash: '3000.00',
      card: '3000.00',
      credit: '3000.00',
    });
    expect(cash.status).toBe(201);
    expect(card.status).toBe(201);
    expect(credit.status).toBe(201);
  });
});

describe('GET /api/sales/lookup (HU-16)', () => {
  it('encuentra el producto por código interno o por código de barras', async () => {
    const { app } = buildApp();

    const byCode = await request(app).get('/api/sales/lookup?code=P001');
    const byBarcode = await request(app).get('/api/sales/lookup?code=7501000000012');

    expect(byCode.status).toBe(200);
    expect(byCode.body.data).toEqual(expect.objectContaining({ id: COFFEE_ID, price: '1500.00' }));
    expect(byBarcode.body.data.id).toBe(COFFEE_ID);
  });

  it('responde 404 si el código no existe y 409 si el producto está desactivado', async () => {
    const { app } = buildApp();

    const missing = await request(app).get('/api/sales/lookup?code=NOEXISTE');
    expect(missing.status).toBe(404);
    expect(missing.body.error.message).toContain('Regístrelo en el catálogo de inventario.');
    expect((await request(app).get('/api/sales/lookup?code=P003')).status).toBe(409);
    expect((await request(app).get('/api/sales/lookup?code=P003')).status).toBe(409);
  });

  it('responde 400 ante un código inválido o vacío', async () => {
    const { app } = buildApp();

    expect((await request(app).get('/api/sales/lookup?code=%3Cscript%3E')).status).toBe(400);
    expect((await request(app).get('/api/sales/lookup?code=')).status).toBe(400);
    expect((await request(app).get('/api/sales/lookup')).status).toBe(400);
  });
});

describe('POST /api/sales/:id/adjustments (HU-35)', () => {
  it('registra una devolución parcial, devuelve el stock y reduce el total conservando la auditoría', async () => {
    const { app, sales } = buildApp();
    const created = await request(app).post('/api/sales').send(body());
    const sale = created.body.data;

    const response = await request(app)
      .post(`/api/sales/${sale.id}/adjustments`)
      .send({
        type: 'RETURN',
        reason: 'Producto dañado',
        items: [{ saleItemId: sale.items[0].id, quantity: 1 }],
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'PARTIALLY_RETURNED', total: '1500.00' });
    expect(response.body.data.adjustments[0]).toMatchObject({
      type: 'RETURN',
      reason: 'Producto dañado',
      total: '1500.00',
    });
    expect(response.body.data.adjustments[0].items[0]).toMatchObject({
      productName: 'Café molido 500 g',
      quantity: 1,
    });
    expect(response.body.data.items[0]).toMatchObject({
      quantity: 2,
      returnedQuantity: 1,
      availableQuantity: 1,
    });
    expect(Date.parse(response.body.data.adjustments[0].createdAt)).not.toBeNaN();
    expect(sales.stockOf(COFFEE_ID)).toBe(9);
  });

  it('anula lo restante y rechaza volver a anular una venta anulada', async () => {
    const { app, sales } = buildApp();
    const created = await request(app).post('/api/sales').send(body());
    const sale = created.body.data;

    const canceled = await request(app)
      .post(`/api/sales/${sale.id}/adjustments`)
      .send({ type: 'VOID', reason: 'Cobro equivocado' });
    const retry = await request(app)
      .post(`/api/sales/${sale.id}/adjustments`)
      .send({ type: 'VOID', reason: 'Segundo intento' });

    expect(canceled.status).toBe(200);
    expect(canceled.body.data).toMatchObject({ status: 'VOID', total: '0.00' });
    expect(canceled.body.data.adjustments[0]).toMatchObject({
      type: 'VOID',
      reason: 'Cobro equivocado',
      total: '3000.00',
    });
    expect(retry.status).toBe(409);
    expect(retry.body.error.message).toContain('ya fue anulada');
    expect(sales.stockOf(COFFEE_ID)).toBe(10);
  });

  it('rechaza motivos vacíos, cantidades mayores a las vendidas y venta inexistente', async () => {
    const { app } = buildApp();
    const created = await request(app).post('/api/sales').send(body());
    const sale = created.body.data;
    const path = `/api/sales/${sale.id}/adjustments`;

    expect((await request(app).post(path).send({ type: 'VOID', reason: '  ' })).status).toBe(400);

    const excessive = await request(app)
      .post(path)
      .send({
        type: 'RETURN',
        reason: 'Devolución',
        items: [{ saleItemId: sale.items[0].id, quantity: 3 }],
      });
    expect(excessive.status).toBe(409);

    const missing = await request(app)
      .post(`/api/sales/${MISSING_ID}/adjustments`)
      .send({ type: 'VOID', reason: 'Venta incorrecta' });
    expect(missing.status).toBe(404);
  });
});

describe('POST /api/sales — carrito y total (HU-16)', () => {
  it('calcula el total en el servidor e ignora los precios que envíe el navegador', async () => {
    const { app, sales } = buildApp();

    const response = await request(app)
      .post('/api/sales')
      .send(
        body({
          items: [
            { productId: COFFEE_ID, quantity: 2, unitPrice: '1.00' },
            { productId: RICE_ID, quantity: 1, unitPrice: '1.00' },
          ],
          total: '3.00',
        }),
      );

    expect(response.status).toBe(201);
    // 2 × 1500.00 + 1 × 900.00
    expect(response.body.data.total).toBe('3900.00');
    expect(response.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: COFFEE_ID,
          unitPrice: '1500.00',
          subtotal: '3000.00',
        }),
      ]),
    );
    expect(sales.stockOf(COFFEE_ID)).toBe(8);
    expect(sales.stockOf(RICE_ID)).toBe(4);
  });

  it('suma las líneas repetidas del mismo producto', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/api/sales')
      .send(
        body({
          items: [
            { productId: COFFEE_ID, quantity: 1 },
            { productId: COFFEE_ID, quantity: 2 },
          ],
        }),
      );

    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].quantity).toBe(3);
    expect(response.body.data.total).toBe('4500.00');
  });

  it('rechaza con 409 el stock insuficiente, el producto inactivo y responde 404 al inexistente', async () => {
    const { app, sales } = buildApp();

    const stock = await request(app)
      .post('/api/sales')
      .send(body({ items: [{ productId: COFFEE_ID, quantity: 11 }] }));
    const inactive = await request(app)
      .post('/api/sales')
      .send(body({ items: [{ productId: OFF_ID, quantity: 1 }] }));
    const missing = await request(app)
      .post('/api/sales')
      .send(body({ items: [{ productId: MISSING_ID, quantity: 1 }] }));

    expect(stock.status).toBe(409);
    expect(stock.body.error.message).toContain('Stock insuficiente');
    expect(inactive.status).toBe(409);
    expect(missing.status).toBe(404);
    expect(sales.sales).toHaveLength(0);
    expect(sales.stockOf(COFFEE_ID)).toBe(10);
  });

  it('responde 400 ante carrito vacío, cantidad 0, decimal o llave inválida', async () => {
    const { app } = buildApp();

    for (const invalid of [
      body({ items: [] }),
      body({ items: [{ productId: COFFEE_ID, quantity: 0 }] }),
      body({ items: [{ productId: COFFEE_ID, quantity: 1.5 }] }),
      body({ idempotencyKey: 'no-es-uuid' }),
    ]) {
      expect((await request(app).post('/api/sales').send(invalid)).status).toBe(400);
    }
  });

  it('traduce el rechazo del repositorio (otra venta se llevó el stock) a 409', async () => {
    const { app, sales } = buildApp();
    sales.rejectWith = 'INSUFFICIENT_STOCK';

    const response = await request(app).post('/api/sales').send(body());

    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain('otra venta');
  });

  it('un reintento con la misma llave devuelve la venta original sin duplicarla ni descontar de nuevo', async () => {
    const { app, sales } = buildApp();
    const payload = body();

    const first = await request(app).post('/api/sales').send(payload);
    const retry = await request(app).post('/api/sales').send(payload);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect(sales.sales).toHaveLength(1);
    expect(sales.stockOf(COFFEE_ID)).toBe(8);
  });
});

describe('POST /api/sales — método de pago (HU-17)', () => {
  it('efectivo: calcula el cambio y guarda el monto recibido', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/api/sales')
      .send(body({ paymentMethod: 'CASH', cashReceived: '5000' }));

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        paymentMethod: 'CASH',
        total: '3000.00',
        cashReceived: '5000.00',
        change: '2000.00',
      }),
    );
  });

  it('efectivo exacto devuelve cambio 0.00', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/api/sales')
      .send(body({ paymentMethod: 'CASH', cashReceived: '3000.00' }));

    expect(response.body.data.change).toBe('0.00');
  });

  it('rechaza con 400 el efectivo insuficiente o ausente y no vende', async () => {
    const { app, sales } = buildApp();

    const short = await request(app)
      .post('/api/sales')
      .send(body({ paymentMethod: 'CASH', cashReceived: '2999.99' }));
    const missing = await request(app)
      .post('/api/sales')
      .send(body({ paymentMethod: 'CASH' }));

    expect(short.status).toBe(400);
    expect(short.body.error.message).toContain('menor al total');
    expect(missing.status).toBe(400);
    expect(sales.sales).toHaveLength(0);
    expect(sales.stockOf(COFFEE_ID)).toBe(10);
  });

  it('tarjeta: guarda CARD, sin efectivo ni cambio', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/api/sales')
      .send(body({ paymentMethod: 'CARD' }));

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(
      expect.objectContaining({ paymentMethod: 'CARD', cashReceived: null, change: null }),
    );
  });

  it('tarjeta con monto recibido es un error', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/api/sales')
      .send(body({ paymentMethod: 'CARD', cashReceived: '5000' }));

    expect(response.status).toBe(400);
  });

  it('no permite finalizar sin método de pago', async () => {
    const { app, sales } = buildApp();
    const { paymentMethod: _omitted, ...withoutMethod } = body();

    const response = await request(app).post('/api/sales').send(withoutMethod);

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain('Seleccione el método de pago');
    expect(sales.sales).toHaveLength(0);
  });

  it('el historial se filtra por método de pago', async () => {
    const { app } = buildApp();

    await request(app)
      .post('/api/sales')
      .send(body({ paymentMethod: 'CARD' }));
    await request(app)
      .post('/api/sales')
      .send(body({ paymentMethod: 'CASH', cashReceived: '9000' }));
    await request(app)
      .post('/api/sales')
      .send(body({ paymentMethod: 'CREDIT', customerId: CUSTOMER_ID }));

    const all = await request(app).get('/api/sales');
    const cash = await request(app).get('/api/sales?paymentMethod=CASH');
    const invalid = await request(app).get('/api/sales?paymentMethod=BITCOIN');

    expect(all.body.data).toHaveLength(3);
    expect(cash.body.data.map((sale: { paymentMethod: string }) => sale.paymentMethod)).toEqual([
      'CASH',
    ]);
    expect(invalid.status).toBe(400);
  });

  it('GET /:id devuelve la venta y 404 si no existe', async () => {
    const { app } = buildApp();
    const created = await request(app).post('/api/sales').send(body());

    expect((await request(app).get(`/api/sales/${created.body.data.id}`)).body.data.number).toBe(1);
    expect((await request(app).get(`/api/sales/${MISSING_ID}`)).status).toBe(404);
  });
});

describe('POST /api/sales — fiado (HU-18)', () => {
  it('exige un cliente', async () => {
    const { app, sales } = buildApp();

    const response = await request(app)
      .post('/api/sales')
      .send(body({ paymentMethod: 'CREDIT' }));

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain('necesita un cliente');
    expect(sales.sales).toHaveLength(0);
  });

  it('rechaza un cliente inexistente (404) o inactivo (409)', async () => {
    const { app } = buildApp();

    const missing = await request(app)
      .post('/api/sales')
      .send(body({ paymentMethod: 'CREDIT', customerId: MISSING_ID }));
    const inactive = await request(app)
      .post('/api/sales')
      .send(body({ paymentMethod: 'CREDIT', customerId: INACTIVE_CUSTOMER_ID }));

    expect(missing.status).toBe(404);
    expect(inactive.status).toBe(409);
  });

  it('registra el fiado, descuenta stock y suma a la deuda previa (₡5 000 + ₡2 500 = ₡7 500)', async () => {
    const { app, sales, customers } = buildApp();
    customers.totals.set(CUSTOMER_ID, { credited: '5000.00', paid: '0.00' });

    const response = await request(app)
      .post('/api/sales')
      .send(
        body({
          paymentMethod: 'CREDIT',
          customerId: CUSTOMER_ID,
          items: [
            { productId: RICE_ID, quantity: 1 },
            { productId: COFFEE_ID, quantity: 1 },
          ],
        }),
      );

    // 900.00 + 1500.00 = 2400.00 → 5000.00 + 2400.00
    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        paymentMethod: 'CREDIT',
        total: '2400.00',
        customer: { id: CUSTOMER_ID, name: 'Doña Marta' },
        customerBalance: '7400.00',
        change: null,
      }),
    );
    expect(sales.stockOf(COFFEE_ID)).toBe(9);
  });

  it('descuenta los abonos previos y acumula dos fiados consecutivos', async () => {
    const { app, customers } = buildApp();
    customers.totals.set(CUSTOMER_ID, { credited: '5000.00', paid: '1500.50' });

    const first = await request(app)
      .post('/api/sales')
      .send(
        body({
          paymentMethod: 'CREDIT',
          customerId: CUSTOMER_ID,
          items: [{ productId: RICE_ID, quantity: 1 }],
        }),
      );
    const second = await request(app)
      .post('/api/sales')
      .send(
        body({
          paymentMethod: 'CREDIT',
          customerId: CUSTOMER_ID,
          items: [{ productId: RICE_ID, quantity: 1 }],
        }),
      );

    // 5000.00 − 1500.50 + 900.00 = 4399.50; luego + 900.00
    expect(first.body.data.customerBalance).toBe('4399.50');
    expect(second.body.data.customerBalance).toBe('5299.50');
  });

  it('el cliente no se admite en ventas que no son a crédito', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/api/sales')
      .send(body({ paymentMethod: 'CARD', customerId: CUSTOMER_ID }));

    expect(response.status).toBe(400);
  });
});

describe('/api/customers (HU-18)', () => {
  it('lista clientes con su saldo y crea clientes básicos', async () => {
    const { app, customers } = buildApp();
    customers.totals.set(CUSTOMER_ID, { credited: '5000.00', paid: '1000.00' });

    const list = await request(app).get('/api/customers');
    const created = await request(app)
      .post('/api/customers')
      .send({ name: '  Nuevo Cliente ', phone: '' });

    expect(list.body.data[0]).toEqual(
      expect.objectContaining({ name: 'Doña Marta', balance: '4000.00' }),
    );
    expect(created.status).toBe(201);
    expect(created.body.data).toEqual(
      expect.objectContaining({ name: 'Nuevo Cliente', phone: null, balance: '0.00' }),
    );
    expect((await request(app).post('/api/customers').send({ name: '  ' })).status).toBe(400);
  });
});

describe('GET /api/sales/:id — base del comprobante (HU-34)', () => {
  it('devuelve las líneas con el precio guardado y los datos de pago', async () => {
    const { app } = buildApp();
    const created = await request(app)
      .post('/api/sales')
      .send(body({ paymentMethod: 'CASH', cashReceived: '5000' }));

    const response = await request(app).get(`/api/sales/${created.body.data.id}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        number: 1,
        paymentMethod: 'CASH',
        total: '3000.00',
        cashReceived: '5000.00',
        change: '2000.00',
      }),
    );
    expect(response.body.data.items[0]).toEqual(
      expect.objectContaining({ name: 'Café molido 500 g', quantity: 2, unitPrice: '1500.00' }),
    );
  });

  it('responde 404 si la venta no existe y 400 si el identificador no es válido', async () => {
    const { app } = buildApp();

    expect((await request(app).get(`/api/sales/${MISSING_ID}`)).status).toBe(404);
    expect((await request(app).get('/api/sales/no-es-un-uuid')).status).toBe(400);
  });
});
