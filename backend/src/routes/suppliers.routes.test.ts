import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../middleware/error-handler.middleware.js';
import {
  COFFEE_ID,
  FakeSuppliersRepository,
  MISSING_SUPPLIER_ID,
  RICE_ID,
  SUPPLIER_A_ID,
} from '../testing/suppliers.repository.fake.js';
import { createSuppliersRouter } from './suppliers.routes.js';

/** Rutas reales de proveedores (HU-21) sobre HTTP, con el repositorio falso. */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/suppliers', createSuppliersRouter(new FakeSuppliersRepository()));
  app.use(errorHandler);

  return app;
}

const body = {
  name: 'Lácteos del Valle',
  phone: '8888-1111',
  products: [{ productId: RICE_ID, unitCost: '700' }],
};

describe('GET /api/suppliers', () => {
  it('responde 200 con los proveedores y sus productos dentro de data', async () => {
    const response = await request(buildApp()).get('/api/suppliers');

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({
      id: SUPPLIER_A_ID,
      products: [{ productId: COFFEE_ID, isPreferred: true }],
    });
  });
});

describe('POST /api/suppliers', () => {
  it('responde 201 con el proveedor registrado', async () => {
    const response = await request(buildApp()).post('/api/suppliers').send(body);

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      name: 'Lácteos del Valle',
      email: null,
      products: [{ productId: RICE_ID, unitCost: '700.00', isPreferred: false }],
    });
  });

  it('responde 400 sin nombre ni contacto', async () => {
    const response = await request(buildApp())
      .post('/api/suppliers')
      .send({ ...body, name: '', phone: '' });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual({
      name: ['El nombre del proveedor es obligatorio.'],
      phone: ['Indique al menos un dato de contacto: teléfono o correo.'],
    });
  });
});

describe('PATCH /api/suppliers/:id', () => {
  it('responde 200 al editar y 404 si no existe', async () => {
    const app = buildApp();

    const ok = await request(app)
      .patch(`/api/suppliers/${SUPPLIER_A_ID}`)
      .send({
        ...body,
        name: 'Distribuidora Central',
        products: [{ productId: COFFEE_ID, unitCost: '1000' }],
      });
    const missing = await request(app).patch(`/api/suppliers/${MISSING_SUPPLIER_ID}`).send(body);

    expect(ok.status).toBe(200);
    expect(missing.status).toBe(404);
  });

  it('responde 409 al intentar quitar un producto del que es principal', async () => {
    const response = await request(buildApp())
      .patch(`/api/suppliers/${SUPPLIER_A_ID}`)
      .send({ ...body, name: 'Distribuidora Central' });

    expect(response.status).toBe(409);
  });
});
