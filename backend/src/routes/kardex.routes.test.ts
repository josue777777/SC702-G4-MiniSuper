import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Role } from '../auth/permissions.js';
import { errorHandler } from '../middleware/error-handler.middleware.js';
import { requirePermission } from '../middleware/require-auth.middleware.js';
import { fakeSession, TEST_BUSINESS_ID } from '../testing/fake-session.js';
import {
  FakeKardexRepository,
  KARDEX_EMPTY_PRODUCT_ID,
  KARDEX_PRODUCT_ID,
  kardexMovement,
} from '../testing/kardex.repository.fake.js';
import { createKardexRouter } from './kardex.routes.js';

/**
 * Kardex (HU-31): rutas reales con repositorio falso, montadas con el mismo
 * permiso con que `routes/index.ts` las publica.
 */

function buildApp(role: Role = 'ENCARGADO', businessId = TEST_BUSINESS_ID) {
  const repository = new FakeKardexRepository(businessId);
  const requestedBusinesses: string[] = [];
  const app = express();

  app.use(express.json());
  app.use(
    '/api/kardex',
    fakeSession(businessId, role),
    requirePermission('kardex'),
    createKardexRouter((id) => {
      requestedBusinesses.push(id);

      return repository as never;
    }),
  );
  app.use(errorHandler);

  return { app, repository, requestedBusinesses };
}

const PRODUCT = `/api/kardex/products/${KARDEX_PRODUCT_ID}`;

describe('permisos', () => {
  it.each(['ENCARGADO', 'BODEGA'] as const)(
    'el rol %s consulta la ficha y el historial',
    async (role) => {
      const { app } = buildApp(role);

      expect((await request(app).get(PRODUCT)).status).toBe(200);
      expect((await request(app).get(`${PRODUCT}/movements`)).status).toBe(200);
      expect((await request(app).get('/api/kardex/products')).status).toBe(200);
    },
  );

  it.each(['CAJERO', 'ADMIN'] as const)('el rol %s recibe 403 en todas las rutas', async (role) => {
    const { app, requestedBusinesses } = buildApp(role);

    for (const path of [PRODUCT, `${PRODUCT}/movements`, '/api/kardex/products']) {
      expect((await request(app).get(path)).status, `${role} ${path}`).toBe(403);
    }

    // Ni siquiera se llegó a consultar datos del negocio.
    expect(requestedBusinesses).toEqual([]);
  });

  it('solo expone lecturas: no hay rutas que cambien el inventario', async () => {
    const { app } = buildApp();

    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      expect((await request(app)[method](PRODUCT).send({})).status, method).toBe(404);
      expect((await request(app)[method](`${PRODUCT}/movements`).send({})).status, method).toBe(
        404,
      );
    }
  });

  it('el negocio sale de la sesión: un businessId en la petición se rechaza', async () => {
    const { app, requestedBusinesses } = buildApp('ENCARGADO', TEST_BUSINESS_ID);

    expect(
      (
        await request(app).get(
          `${PRODUCT}/movements?businessId=0b000000-0000-4000-8000-0000000000ff`,
        )
      ).status,
    ).toBe(400);
    expect((await request(app).get(PRODUCT)).status).toBe(200);
    expect(new Set(requestedBusinesses)).toEqual(new Set([TEST_BUSINESS_ID]));
  });
});

describe('GET /api/kardex/products/:productId', () => {
  it('devuelve la ficha sin guardarla en caché', async () => {
    const { app } = buildApp();
    const response = await request(app).get(PRODUCT);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toMatchObject({
      code: 'P001',
      categoryName: 'Bebidas',
      price: '1500.00',
      cost: '1000.50',
      supplierName: 'Distribuidora Central',
      stock: 8,
    });
  });

  it('un id inexistente responde 404 y uno mal formado responde 400', async () => {
    const { app } = buildApp();

    const missing = await request(app).get(
      '/api/kardex/products/0a1b2c3d-0000-4000-8000-0000000000ff',
    );

    expect(missing.status).toBe(404);
    expect(missing.body.error.message).toBe('El producto no existe.');
    expect((await request(app).get('/api/kardex/products/no-es-un-uuid')).status).toBe(400);
  });
});

describe('GET /api/kardex/products/:productId/movements', () => {
  it('pagina el historial y entrega entradas y salidas ya clasificadas', async () => {
    const { app, repository } = buildApp();

    repository.movements.set(KARDEX_PRODUCT_ID, [
      kardexMovement({
        id: 'a',
        type: 'ENTRY',
        quantity: 10,
        stockBefore: 0,
        stockAfter: 10,
        at: '2026-10-01T15:00:00Z',
        reason: 'Stock inicial',
      }),
      kardexMovement({
        id: 'b',
        type: 'ADJUSTMENT',
        quantity: 2,
        stockBefore: 10,
        stockAfter: 8,
        at: '2026-10-02T15:00:00Z',
        reason: 'Conteo físico',
      }),
      kardexMovement({
        id: 'c',
        type: 'EXIT',
        quantity: 1,
        stockBefore: 8,
        stockAfter: 7,
        at: '2026-10-03T15:00:00Z',
        sale: { id: 's1', number: 4 },
      }),
    ]);

    const response = await request(app).get(`${PRODUCT}/movements?page=1&pageSize=2`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(response.body.data.items.map((item: { id: string }) => item.id)).toEqual(['c', 'b']);
    // El ajuste que bajó el stock es una salida, no una entrada.
    expect(response.body.data.items[1]).toMatchObject({
      entry: 0,
      exit: 2,
      concept: 'Conteo físico',
    });

    const second = await request(app).get(`${PRODUCT}/movements?page=2&pageSize=2`);

    expect(second.body.data.items.map((item: { id: string }) => item.id)).toEqual(['a']);
  });

  it('usa 15 por página por defecto (el estándar del sistema) y sin movimientos devuelve una página vacía', async () => {
    const { app } = buildApp();
    const response = await request(app).get(
      `/api/kardex/products/${KARDEX_EMPTY_PRODUCT_ID}/movements`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      items: [],
      page: 1,
      pageSize: 15,
      total: 0,
      totalPages: 0,
    });
  });

  it.each([
    'page=0',
    'page=-1',
    'page=abc',
    'pageSize=0',
    'pageSize=101',
    'pageSize=1.5',
    'orden=asc',
  ])('rechaza %s con 400', async (query) => {
    const { app } = buildApp();

    expect((await request(app).get(`${PRODUCT}/movements?${query}`)).status).toBe(400);
  });
});

describe('GET /api/kardex/products (selector)', () => {
  it('lista los productos que devuelve el repositorio y valida la búsqueda', async () => {
    const { app, repository } = buildApp();

    repository.options = [{ id: KARDEX_PRODUCT_ID, code: 'P001', name: 'Café', isActive: false }];

    const response = await request(app).get('/api/kardex/products?search=%20caf%C3%A9%20');

    expect(response.body.data).toEqual(repository.options);
    // La búsqueda se recorta antes de llegar al repositorio.
    expect(repository.searches[0]?.term).toBe('café');
    expect((await request(app).get(`/api/kardex/products?search=${'x'.repeat(121)}`)).status).toBe(
      400,
    );
    expect((await request(app).get('/api/kardex/products?limit=500')).status).toBe(400);
  });
});
