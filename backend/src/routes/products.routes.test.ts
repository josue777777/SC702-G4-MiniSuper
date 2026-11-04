import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  buildProduct,
  CATEGORY_ID,
  FakeProductsRepository,
  OTHER_PRODUCT_ID,
  PRODUCT_ID,
  SUPPLIER_ID,
} from '../testing/products.repository.fake.js';
import { errorHandler } from '../middleware/error-handler.middleware.js';
import { createProductsRouter } from './products.routes.js';
import { fakeSession } from '../testing/fake-session.js';

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
  app.use(
    '/api/products',
    fakeSession(),
    createProductsRouter(() => repository),
  );
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

  it('filtra por categoría y excluye los inactivos', async () => {
    const { app } = buildApp(
      new FakeProductsRepository({
        products: [
          buildProduct(),
          buildProduct({ id: OTHER_PRODUCT_ID, code: 'P002', isActive: false }),
        ],
      }),
    );

    const response = await request(app).get(`/api/products?categoryId=${CATEGORY_ID}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ id: PRODUCT_ID });
  });

  it('responde 400 si categoryId no es un UUID', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/products?categoryId=abc');

    expect(response.status).toBe(400);
  });

  it('busca con q por nombre parcial y solo devuelve activos (HU-05)', async () => {
    const { app } = buildApp(
      new FakeProductsRepository({
        products: [
          buildProduct(),
          buildProduct({
            id: OTHER_PRODUCT_ID,
            code: 'P002',
            name: 'Café inactivo',
            isActive: false,
          }),
        ],
      }),
    );

    const response = await request(app).get(`/api/products?q=${encodeURIComponent('café')}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ id: PRODUCT_ID });
  });

  it('combina q con categoryId y responde data vacío si no hay coincidencias', async () => {
    const { app } = buildApp();

    const response = await request(app).get(`/api/products?q=leche&categoryId=${CATEGORY_ID}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [] });
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

describe('POST /api/products/:id/barcode (HU-07)', () => {
  it('genera y devuelve el código asociado al producto', async () => {
    const { app, repository } = buildApp();

    const response = await request(app).post(`/api/products/${PRODUCT_ID}/barcode`).send({});

    expect(response.status).toBe(200);
    expect(response.body.data.barcode).toMatch(/^\d{13}$/);
    await expect(repository.findById(PRODUCT_ID)).resolves.toMatchObject({
      barcode: response.body.data.barcode,
    });
  });

  it('advierte si ya tiene código y solo lo reemplaza con confirmación', async () => {
    const { app } = buildApp(
      new FakeProductsRepository({
        products: [buildProduct({ barcode: '4006381333931' })],
      }),
    );

    const response = await request(app)
      .post(`/api/products/${PRODUCT_ID}/barcode`)
      .send({ replaceExisting: false });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe('El producto ya tiene un código de barras.');
  });

  it('rechaza identificadores que no sean UUID', async () => {
    const { app } = buildApp();

    const response = await request(app).post('/api/products/no-valido/barcode').send({});

    expect(response.status).toBe(400);
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

describe('/api/products/:id/image (HU-01)', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

  it('PUT guarda la imagen y GET la devuelve con su tipo', async () => {
    const { app } = buildApp();

    const saved = await request(app)
      .put(`/api/products/${PRODUCT_ID}/image`)
      .set('Content-Type', 'image/png')
      .send(png);
    const image = await request(app).get(`/api/products/${PRODUCT_ID}/image`);

    expect(saved.status).toBe(200);
    expect(saved.body.data.imageUrl).toContain(`/api/products/${PRODUCT_ID}/image?v=`);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(image.body as Buffer, png)).toBe(0);
  });

  it('PUT rechaza tipos no permitidos, como SVG (400)', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .put(`/api/products/${PRODUCT_ID}/image`)
      .set('Content-Type', 'image/svg+xml')
      .send('<svg onload="alert(1)"></svg>');

    expect(response.status).toBe(400);
    expect(response.body.error.details.mimeType).toEqual([
      'Solo se aceptan imágenes PNG, JPG o WEBP.',
    ]);
  });

  it('PUT responde 413 si la imagen supera 2 MB', async () => {
    const { app } = buildApp();
    const big = Buffer.alloc(2 * 1024 * 1024 + 1, 0);
    png.copy(big);

    const response = await request(app)
      .put(`/api/products/${PRODUCT_ID}/image`)
      .set('Content-Type', 'image/png')
      .send(big);

    expect(response.status).toBe(413);
    expect(response.body.error.message).toBe('La imagen supera el máximo de 2 MB.');
  });

  it('DELETE quita la imagen y después GET responde 404', async () => {
    const { app } = buildApp();
    await request(app)
      .put(`/api/products/${PRODUCT_ID}/image`)
      .set('Content-Type', 'image/png')
      .send(png);

    const removed = await request(app).delete(`/api/products/${PRODUCT_ID}/image`);
    const image = await request(app).get(`/api/products/${PRODUCT_ID}/image`);

    expect(removed.body.data.imageUrl).toBeNull();
    expect(image.status).toBe(404);
  });
});

describe('DELETE /api/products/:id (HU-03)', () => {
  it('responde 409 con un mensaje claro si el producto sigue activo', async () => {
    const { app } = buildApp();

    const response = await request(app).delete(`/api/products/${PRODUCT_ID}`);

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe(
      'Primero desactive el producto; solo se borra uno desactivado.',
    );
  });

  it('responde 200 y el producto deja de aparecer en el catálogo', async () => {
    const { app } = buildApp(
      new FakeProductsRepository({ products: [buildProduct({ isActive: false })] }),
    );

    const response = await request(app).delete(`/api/products/${PRODUCT_ID}`);
    const list = await request(app).get('/api/products');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { id: PRODUCT_ID } });
    expect(list.body.data).toEqual([]);
  });
});

describe('PATCH /api/products/:id/activate (HU-03)', () => {
  it('responde 200 con el producto activo, o 404 si no existe', async () => {
    const { app } = buildApp(
      new FakeProductsRepository({ products: [buildProduct({ isActive: false })] }),
    );

    const activated = await request(app).patch(`/api/products/${PRODUCT_ID}/activate`);
    const missing = await request(app).patch(`/api/products/${OTHER_PRODUCT_ID}/activate`);

    expect(activated.status).toBe(200);
    expect(activated.body.data.isActive).toBe(true);
    expect(missing.status).toBe(404);
  });
});
