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
import { fakeSession } from '../testing/fake-session.js';

/** Rutas reales de proveedores (HU-21) sobre HTTP, con el repositorio falso. */
function buildApp(repository = new FakeSuppliersRepository()) {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/suppliers',
    fakeSession(),
    createSuppliersRouter(() => repository),
  );
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

  it('responde 201 con un proveedor sin productos (primer paso con la base vacía)', async () => {
    const response = await request(buildApp())
      .post('/api/suppliers')
      .send({ ...body, products: [] });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ name: 'Lácteos del Valle', products: [] });
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

describe('GET /api/suppliers/costs/:productId (HU-39)', () => {
  it('compara el costo del producto entre sus proveedores, del más bajo al más alto', async () => {
    const repository = new FakeSuppliersRepository();

    repository.productCosts.set(COFFEE_ID, {
      product: { id: COFFEE_ID, code: 'P001', name: 'Café molido 500 g' },
      costs: [
        {
          supplierId: SUPPLIER_A_ID,
          supplierName: 'Distribuidora Central',
          unitCost: '1000.50',
          isPreferred: true,
          updatedAt: new Date('2026-11-01T12:00:00Z'),
        },
        {
          supplierId: MISSING_SUPPLIER_ID,
          supplierName: 'Lácteos del Valle',
          unitCost: '950.00',
          isPreferred: false,
          updatedAt: new Date('2026-11-05T12:00:00Z'),
        },
      ],
    });

    const response = await request(buildApp(repository))
      .get(`/api/suppliers/costs/${COFFEE_ID}`)
      .expect(200);

    expect(response.body.data.product).toEqual({
      id: COFFEE_ID,
      code: 'P001',
      name: 'Café molido 500 g',
    });
    expect(
      response.body.data.suppliers.map((item: { supplierName: string; difference: string }) => [
        item.supplierName,
        item.difference,
      ]),
    ).toEqual([
      ['Lácteos del Valle', '0.00'],
      ['Distribuidora Central', '50.50'],
    ]);
  });

  it('responde 404 si el producto no existe (o es de otro negocio) y 400 si el id no es válido', async () => {
    await request(buildApp()).get(`/api/suppliers/costs/${RICE_ID}`).expect(404);
    await request(buildApp()).get('/api/suppliers/costs/no-es-un-id').expect(400);
  });
});
