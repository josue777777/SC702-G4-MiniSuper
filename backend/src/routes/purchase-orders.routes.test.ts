import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../middleware/error-handler.middleware.js';
import {
  COFFEE_ID,
  FakePurchaseOrdersRepository,
  MISSING_ORDER_ID,
  OTHER_SUPPLIER_ID,
  SUPPLIER_ID,
} from '../testing/purchase-orders.repository.fake.js';
import { createPurchaseOrdersRouter } from './purchase-orders.routes.js';
import { fakeSession } from '../testing/fake-session.js';

/** Rutas reales de pedidos a proveedor (HU-22, HU-24) con el repositorio falso. */
function buildApp() {
  const repository = new FakePurchaseOrdersRepository();
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
