import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_ID,
  FakeProductsRepository,
  PRODUCT_ID,
  SUPPLIER_ID,
} from '../testing/products.repository.fake.js';
import { errorHandler } from '../middleware/error-handler.middleware.js';
import { createProductsRouter } from './products.routes.js';

/**
 * Pruebas de las rutas REALES (routes → controller → service → repositorio
 * falso) sobre HTTP y sin base de datos.
 *
 * Comprueban lo que la pantalla necesita saber: el status code y la forma del
 * JSON, incluido el mensaje que ve el dueño. Se monta la misma fábrica de rutas
 * que usa producción, así que una ruta mal declarada también falla aquí.
 */
function buildApp(repository = new FakeProductsRepository()) {
  const app = express();
  app.use(express.json());
  app.use('/api/products', createProductsRouter(repository));
  app.use(errorHandler);

  return { app, repository };
}

/** Cuerpo válido de HU-01 para las pruebas que no prueban validación. */
function validBody(): Record<string, unknown> {
  return {
    code: 'P003',
    name: 'Arroz 1 kg',
    categoryId: CATEGORY_ID,
    price: '900.00',
    cost: '700.00',
    stock: 4,
    supplierId: SUPPLIER_ID,
  };
}

describe('GET /api/products', () => {
  it('responde 200 con los productos dentro de data', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/products');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [expect.objectContaining({ id: PRODUCT_ID, code: 'P001', price: '1500.00' })],
    });
  });
});

describe('GET /api/products/form-options', () => {
  it('responde 200 con las categorías y proveedores activos', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/products/form-options');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        categories: [{ id: CATEGORY_ID, name: 'Bebidas' }],
        suppliers: [{ id: SUPPLIER_ID, name: 'Distribuidora Central' }],
      },
    });
  });

  it('responde 200 con arreglos vacíos si todavía no hay datos de apoyo', async () => {
    const { app } = buildApp(
      new FakeProductsRepository({ products: [], categories: [], suppliers: [] }),
    );

    const response = await request(app).get('/api/products/form-options');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { categories: [], suppliers: [] } });
  });
});

describe('POST /api/products (HU-01)', () => {
  it('responde 201 con el producto creado', async () => {
    const { app, repository } = buildApp(new FakeProductsRepository({ products: [] }));

    const response = await request(app).post('/api/products').send(validBody());

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ code: 'P003', price: '900.00', stock: 4 });
    expect(repository.createdPlans[0]?.initialMovement?.type).toBe('ENTRY');
  });

  it('responde 400 con el detalle por campo cuando el cuerpo no es válido', async () => {
    const { app, repository } = buildApp(new FakeProductsRepository({ products: [] }));

    const response = await request(app)
      .post('/api/products')
      .send({ ...validBody(), price: -5, stock: 1.5 });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('Los datos enviados no son válidos.');
    expect(response.body.error.details.price).toContain('El precio no puede ser negativo.');
    expect(response.body.error.details.stock).toContain('El stock debe ser un número entero.');
    expect(repository.createdPlans).toHaveLength(0);
  });

  it('responde 409 con el mensaje de código duplicado que muestra la pantalla', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/api/products')
      .send({ ...validBody(), code: 'P001' });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe('Ya existe un producto con ese código.');
  });

  it('responde 400 cuando la categoría no existe o está inactiva', async () => {
    const { app } = buildApp(
      new FakeProductsRepository({
        products: [],
        categories: [],
        suppliers: [{ id: SUPPLIER_ID, name: 'Distribuidora Central' }],
      }),
    );

    const response = await request(app).post('/api/products').send(validBody());

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('La categoría indicada no existe o está inactiva.');
  });
});

describe('PATCH /api/products/:id (HU-02)', () => {
  it('responde 200 con el producto actualizado', async () => {
    const { app, repository } = buildApp();

    const response = await request(app)
      .patch(`/api/products/${PRODUCT_ID}`)
      .send({ ...validBody(), code: 'P001', price: '1800.00', stock: 12 });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: PRODUCT_ID, price: '1800.00', stock: 12 });
    // El stock pasó de 10 a 12: queda el ajuste para el historial de inventario.
    expect(repository.updatedPlans[0]?.plan.stockMovement).toMatchObject({
      type: 'ADJUSTMENT',
      quantity: 2,
      stockBefore: 10,
      stockAfter: 12,
    });
  });

  it('responde 404 si el producto no existe', async () => {
    const { app } = buildApp(new FakeProductsRepository({ products: [] }));

    const response = await request(app)
      .patch(`/api/products/${PRODUCT_ID}`)
      .send({ ...validBody(), code: 'P001' });

    expect(response.status).toBe(404);
    expect(response.body.error.message).toBe('El producto no existe.');
  });

  it('responde 400 si el identificador de la ruta no es un UUID', async () => {
    const { app } = buildApp();

    const response = await request(app).patch('/api/products/producto-1').send(validBody());

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('Los datos enviados no son válidos.');
  });
});

describe('PATCH /api/products/:id/deactivate (HU-03)', () => {
  it('responde 200 y deja el producto inactivo', async () => {
    const { app, repository } = buildApp();

    const response = await request(app).patch(`/api/products/${PRODUCT_ID}/deactivate`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: PRODUCT_ID, isActive: false });
    expect(repository.deactivatedIds).toEqual([PRODUCT_ID]);
  });

  it('es idempotente: desactivar dos veces no vuelve a escribir', async () => {
    const { app, repository } = buildApp();

    const first = await request(app).patch(`/api/products/${PRODUCT_ID}/deactivate`);
    const second = await request(app).patch(`/api/products/${PRODUCT_ID}/deactivate`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.isActive).toBe(false);
    expect(repository.deactivatedIds).toEqual([PRODUCT_ID]);
  });

  it('responde 404 si el producto no existe', async () => {
    const { app } = buildApp(new FakeProductsRepository({ products: [] }));

    const response = await request(app).patch(`/api/products/${PRODUCT_ID}/deactivate`);

    expect(response.status).toBe(404);
    expect(response.body.error.message).toBe('El producto no existe.');
  });
});
