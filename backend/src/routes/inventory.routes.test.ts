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

/**
 * Pruebas de las rutas REALES del conteo físico (HU-10) sobre HTTP, con el
 * repositorio falso: status codes y forma del JSON, incluidos los errores.
 */
function buildApp(repository = new FakeInventoryRepository()) {
  const app = express();
  app.use(express.json());
  app.use('/api/inventory', createInventoryRouter(repository));
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
