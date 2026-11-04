import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../middleware/error-handler.middleware.js';
import {
  COUNT_CREATED_AT,
  COUNT_PRODUCT_ID,
  FakeInventoryRepository,
  MISSING_PRODUCT_ID,
} from '../testing/inventory.repository.fake.js';
import { createInventoryRouter } from './inventory.routes.js';
import { fakeSession } from '../testing/fake-session.js';

/**
 * Pruebas de las rutas REALES del conteo físico (HU-10) sobre HTTP, con el
 * repositorio falso: status codes y forma del JSON, incluidos los errores.
 */
function buildApp(repository = new FakeInventoryRepository()) {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/inventory',
    fakeSession(),
    createInventoryRouter(() => repository),
  );
  app.use(errorHandler);

  return { app, repository };
}

describe('POST /api/inventory/counts', () => {
  it('responde 201 con el conteo y la diferencia dentro de data', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/api/inventory/counts')
      .send({ productId: COUNT_PRODUCT_ID, countedQuantity: 8 });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      data: {
        id: 'movement-1',
        productId: COUNT_PRODUCT_ID,
        productCode: 'P001',
        productName: 'Café molido 500 g',
        systemStock: 10,
        countedQuantity: 8,
        difference: -2,
        createdAt: COUNT_CREATED_AT,
      },
    });
  });

  it('responde 400 y pide corregir una cantidad negativa, sin escribir nada', async () => {
    const { app, repository } = buildApp();

    const response = await request(app)
      .post('/api/inventory/counts')
      .send({ productId: COUNT_PRODUCT_ID, countedQuantity: -3 });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual({
      countedQuantity: ['La cantidad contada no puede ser negativa. Corríjala e intente de nuevo.'],
    });
    expect(repository.createdPlans).toEqual([]);
  });

  it('responde 404 si el producto no existe', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/api/inventory/counts')
      .send({ productId: MISSING_PRODUCT_ID, countedQuantity: 5 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { message: 'El producto no existe.' } });
  });
});

describe('GET /api/inventory/counts', () => {
  it('responde 200 con el historial de conteos dentro de data', async () => {
    const { app } = buildApp();

    await request(app)
      .post('/api/inventory/counts')
      .send({ productId: COUNT_PRODUCT_ID, countedQuantity: 8 });

    const response = await request(app).get('/api/inventory/counts');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [expect.objectContaining({ productId: COUNT_PRODUCT_ID, difference: -2 })],
    });
  });
});

describe('Un conteo confirmado no se puede editar ni borrar', () => {
  it('no existen rutas PATCH, PUT ni DELETE para los conteos', async () => {
    const { app } = buildApp();

    for (const method of ['patch', 'put', 'delete'] as const) {
      const response = await request(app)[method]('/api/inventory/counts/movement-1').send({});

      expect(response.status).toBe(404);
    }
  });
});

describe('GET /api/inventory/low-stock (HU-08)', () => {
  it('responde 200 con las alertas calculadas dentro de data', async () => {
    const { app } = buildApp(
      new FakeInventoryRepository([
        { id: COUNT_PRODUCT_ID, code: 'P001', name: 'Café molido 500 g', stock: 2, minStock: 5 },
        { id: MISSING_PRODUCT_ID, code: 'P002', name: 'Arroz 1 kg', stock: 30, minStock: 5 },
      ]),
    );

    const response = await request(app).get('/api/inventory/low-stock');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [
        {
          productId: COUNT_PRODUCT_ID,
          productCode: 'P001',
          productName: 'Café molido 500 g',
          stock: 2,
          minStock: 5,
        },
      ],
    });
  });

  it('responde una lista vacía cuando no hay productos con stock bajo', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/inventory/low-stock');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [] });
  });
});

describe('Configuración de inventario por producto (HU-08, HU-09)', () => {
  const TODAY = '2026-10-13';

  function buildConfigApp() {
    const repository = new FakeInventoryRepository();
    const app = express();
    app.use(express.json());
    app.use(
      '/api/inventory',
      fakeSession(),
      createInventoryRouter(
        () => repository,
        () => TODAY,
      ),
    );
    app.use(errorHandler);

    return app;
  }

  it('GET /products responde 200 con mínimo y vencimiento', async () => {
    const response = await request(buildConfigApp()).get('/api/inventory/products');

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({
      productId: COUNT_PRODUCT_ID,
      minStock: 0,
      expirationDate: null,
    });
  });

  it('PATCH /products/:id/min-stock guarda el mínimo y rechaza negativos', async () => {
    const app = buildConfigApp();

    const ok = await request(app)
      .patch(`/api/inventory/products/${COUNT_PRODUCT_ID}/min-stock`)
      .send({ minStock: 4 });
    const bad = await request(app)
      .patch(`/api/inventory/products/${COUNT_PRODUCT_ID}/min-stock`)
      .send({ minStock: -4 });

    expect(ok.status).toBe(200);
    expect(ok.body.data.minStock).toBe(4);
    expect(bad.status).toBe(400);
    expect(bad.body.error.details).toEqual({
      minStock: ['El stock mínimo no puede ser negativo.'],
    });
  });

  it('PATCH /products/:id/expiration-date acepta futura o null y rechaza pasada', async () => {
    const app = buildConfigApp();
    const url = `/api/inventory/products/${COUNT_PRODUCT_ID}/expiration-date`;

    const future = await request(app).patch(url).send({ expirationDate: '2026-11-01' });
    const past = await request(app).patch(url).send({ expirationDate: '2026-01-01' });
    const empty = await request(app).patch(url).send({ expirationDate: null });

    expect(future.status).toBe(200);
    expect(past.status).toBe(400);
    expect(past.body.error.details).toEqual({
      expirationDate: ['La fecha de vencimiento debe ser posterior a hoy.'],
    });
    expect(empty.status).toBe(200);
    expect(empty.body.data.expirationDate).toBeNull();
  });

  it('PATCH sobre un producto inexistente responde 404', async () => {
    const response = await request(buildConfigApp())
      .patch(`/api/inventory/products/${MISSING_PRODUCT_ID}/min-stock`)
      .send({ minStock: 1 });

    expect(response.status).toBe(404);
  });

  it('GET /expirations responde 200 con los próximos a vencer', async () => {
    const app = buildConfigApp();
    await request(app)
      .patch(`/api/inventory/products/${COUNT_PRODUCT_ID}/expiration-date`)
      .send({ expirationDate: '2026-10-20' });

    const response = await request(app).get('/api/inventory/expirations');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      expect.objectContaining({
        productId: COUNT_PRODUCT_ID,
        daysLeft: 7,
        status: 'EXPIRING_SOON',
      }),
    ]);
  });
});
