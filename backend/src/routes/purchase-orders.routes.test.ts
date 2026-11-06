import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../middleware/error-handler.middleware.js';
import {
  COFFEE_ID,
  FakePurchaseOrdersRepository,
  MISSING_ORDER_ID,
  OTHER_SUPPLIER_ID,
  RICE_ID,
  SUPPLIER_ID,
} from '../testing/purchase-orders.repository.fake.js';
import { createPurchaseOrdersRouter } from './purchase-orders.routes.js';
import { fakeSession } from '../testing/fake-session.js';

/** Rutas reales de pedidos a proveedor (HU-22, HU-24) con el repositorio falso. */
function buildApp(repository = new FakePurchaseOrdersRepository()) {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/purchase-orders',
    fakeSession(),
    createPurchaseOrdersRouter(() => repository),
  );
  app.use(errorHandler);

  return app;
}

describe('POST /api/purchase-orders (HU-24)', () => {
  it('responde 201 con el pedido, sus líneas y el total', async () => {
    const response = await request(buildApp())
      .post('/api/purchase-orders')
      .send({ supplierId: SUPPLIER_ID, items: [{ productId: COFFEE_ID, quantity: 2 }] });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      number: 1,
      supplierName: 'Distribuidora Central',
      status: 'PENDING',
      total: '2001.00',
      items: [{ productId: COFFEE_ID, quantity: 2, unitCost: '1000.50', subtotal: '2001.00' }],
    });
  });

  it('responde 400 si el pedido no tiene productos', async () => {
    const response = await request(buildApp())
      .post('/api/purchase-orders')
      .send({ supplierId: SUPPLIER_ID, items: [] });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual({
      items: ['Agregue al menos un producto al pedido.'],
    });
  });
});

describe('GET /api/purchase-orders (HU-22)', () => {
  it('filtra por proveedor y devuelve [] si ese proveedor no tiene pedidos', async () => {
    const app = buildApp();
    await request(app)
      .post('/api/purchase-orders')
      .send({ supplierId: SUPPLIER_ID, items: [{ productId: COFFEE_ID, quantity: 1 }] });

    const mine = await request(app).get(`/api/purchase-orders?supplierId=${SUPPLIER_ID}`);
    const other = await request(app).get(`/api/purchase-orders?supplierId=${OTHER_SUPPLIER_ID}`);

    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(1);
    // Cada fila trae lo que pide el historial: fecha, productos, costo y proveedor.
    expect(mine.body.data[0]).toMatchObject({
      number: 1,
      supplierName: 'Distribuidora Central',
      total: '1000.50',
      itemCount: 1,
      productNames: ['Café molido 500 g'],
    });
    expect(mine.body.data[0].createdAt).toEqual(expect.any(String));
    expect(other.body).toEqual({ data: [] });
  });

  it('GET /:id responde el detalle o 404', async () => {
    const app = buildApp();
    const created = await request(app)
      .post('/api/purchase-orders')
      .send({ supplierId: SUPPLIER_ID, items: [{ productId: COFFEE_ID, quantity: 1 }] });

    const found = await request(app).get(`/api/purchase-orders/${created.body.data.id as string}`);
    const missing = await request(app).get(`/api/purchase-orders/${MISSING_ORDER_ID}`);

    expect(found.status).toBe(200);
    expect(found.body.data.items).toHaveLength(1);
    expect(missing.status).toBe(404);
  });
});

describe('Entregas con factura (HU-38)', () => {
  /** Pedido de 10 cafés y 5 arroces, recién creado. */
  async function orderOf10And5() {
    const repository = new FakePurchaseOrdersRepository();
    const app = buildApp(repository);
    const created = await request(app)
      .post('/api/purchase-orders')
      .send({
        supplierId: SUPPLIER_ID,
        items: [
          { productId: COFFEE_ID, quantity: 10 },
          { productId: RICE_ID, quantity: 5 },
        ],
      })
      .expect(201);

    return { app, repository, id: created.body.data.id as string };
  }

  const delivery = (invoiceNumber: string, coffee: number, rice: number, loadNow = true) => ({
    invoiceNumber,
    receivedOn: '2026-10-20',
    loadNow,
    items: [
      { productId: COFFEE_ID, quantity: coffee },
      { productId: RICE_ID, quantity: rice },
    ],
  });

  it('una entrega parcial deja el pedido abierto; la segunda lo completa', async () => {
    const { app, repository, id } = await orderOf10And5();

    const first = await request(app)
      .post(`/api/purchase-orders/${id}/receipts`)
      .send(delivery('F-1', 6, 5))
      .expect(201);

    expect(first.body.data.status).toBe('PARTIAL');
    expect(first.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: COFFEE_ID, receivedQuantity: 6, pendingQuantity: 4 }),
      ]),
    );
    // El arroz no vino en la segunda: con 0 no se manda al repositorio.
    const second = await request(app)
      .post(`/api/purchase-orders/${id}/receipts`)
      .send(delivery('F-2', 4, 0))
      .expect(201);

    expect(second.body.data).toMatchObject({ status: 'RECEIVED', receivedOn: '2026-10-20' });
    expect(repository.receivedPlans[1]?.plan.items).toEqual([
      { productId: COFFEE_ID, quantity: 4 },
    ]);
    expect(repository.loadReasons).toEqual([
      'Recepción PED-0001 · Factura F-1',
      'Recepción PED-0001 · Factura F-2',
    ]);
  });

  it('la carga puede quedar pendiente y confirmarse después, una sola vez', async () => {
    const { app, repository, id } = await orderOf10And5();
    const registered = await request(app)
      .post(`/api/purchase-orders/${id}/receipts`)
      .send(delivery('F-9', 2, 0, false))
      .expect(201);
    const receipt = registered.body.data.receipts[0];

    expect(registered.body.data.pendingLoads).toBe(1);
    expect(receipt).toMatchObject({ invoiceNumber: 'F-9', loadedAt: null });
    expect(repository.loadReasons).toEqual([]);

    const loaded = await request(app)
      .post(`/api/purchase-orders/${id}/receipts/${receipt.id}/load`)
      .expect(200);

    expect(loaded.body.data.pendingLoads).toBe(0);
    expect(repository.loadReasons).toEqual(['Recepción PED-0001 · Factura F-9']);
    await request(app).post(`/api/purchase-orders/${id}/receipts/${receipt.id}/load`).expect(409);
  });

  it('no deja recibir más de lo que falta, ni con fecha futura, ni sin factura', async () => {
    const { app, id } = await orderOf10And5();
    const send = (body: object) =>
      request(app).post(`/api/purchase-orders/${id}/receipts`).send(body);

    expect((await send(delivery('F-1', 11, 0))).status).toBe(400);
    expect(
      (await send({ ...delivery('F-1', 1, 0), receivedOn: '2999-01-01' })).body.error.details,
    ).toEqual({ receivedOn: ['La fecha de llegada no puede ser futura.'] });
    expect((await send({ ...delivery('F-1', 1, 0), receivedOn: '2026-01-01' })).status).toBe(400);
    expect((await send(delivery('  ', 1, 0))).status).toBe(400);
    expect((await send(delivery('F-1', 0, 0))).body.error.details).toEqual({
      items: ['Anote al menos un producto que haya llegado.'],
    });
  });

  it('la misma factura no se registra dos veces en el pedido', async () => {
    const { app, id } = await orderOf10And5();

    await request(app)
      .post(`/api/purchase-orders/${id}/receipts`)
      .send(delivery('F-1', 1, 0))
      .expect(201);
    await request(app)
      .post(`/api/purchase-orders/${id}/receipts`)
      .send(delivery('F-1', 1, 0))
      .expect(409);
  });

  it('un pedido que llegó en parte se puede dar por concluido; uno cerrado no recibe más', async () => {
    const { app, id } = await orderOf10And5();

    await request(app).post(`/api/purchase-orders/${id}/close`).expect(409);
    await request(app)
      .post(`/api/purchase-orders/${id}/receipts`)
      .send(delivery('F-1', 3, 0))
      .expect(201);

    const closed = await request(app).post(`/api/purchase-orders/${id}/close`).expect(200);

    expect(closed.body.data).toMatchObject({ status: 'RECEIVED', receivedOn: '2026-10-20' });
    await request(app)
      .post(`/api/purchase-orders/${id}/receipts`)
      .send(delivery('F-2', 1, 0))
      .expect(409);
  });

  it('responde 404 si el pedido no existe', async () => {
    await request(buildApp())
      .post(`/api/purchase-orders/${MISSING_ORDER_ID}/receipts`)
      .send(delivery('F-1', 1, 0))
      .expect(404);
  });
});
