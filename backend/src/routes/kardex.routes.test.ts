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
  kardexProduct,
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
      expect((await request(app).get('/api/kardex/movements')).status).toBe(200);
    },
  );

  it.each(['CAJERO', 'ADMIN'] as const)('el rol %s recibe 403 en todas las rutas', async (role) => {
    const { app, requestedBusinesses } = buildApp(role);

    for (const path of [
      PRODUCT,
      `${PRODUCT}/movements`,
      '/api/kardex/products',
      '/api/kardex/movements',
    ]) {
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
      today: { entries: 0, exits: 0, count: 0 },
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

describe('GET /api/kardex/products («Buscar producto»)', () => {
  it('devuelve una página (de 4 por defecto) y valida la búsqueda, la categoría y la página', async () => {
    const { app, repository } = buildApp();

    repository.options = [
      {
        id: KARDEX_PRODUCT_ID,
        code: 'P001',
        barcode: null,
        name: 'Café',
        categoryName: 'Bebidas',
        isActive: false,
        stock: 4,
      },
    ];

    const response = await request(app).get('/api/kardex/products?search=%20caf%C3%A9%20');

    expect(response.body.data).toEqual({
      items: repository.options,
      page: 1,
      pageSize: 4,
      total: 1,
      totalPages: 1,
    });
    // La búsqueda se recorta antes de llegar al repositorio.
    expect(repository.searches[0]?.filter.term).toBe('café');
    expect((await request(app).get(`/api/kardex/products?search=${'x'.repeat(121)}`)).status).toBe(
      400,
    );
    expect((await request(app).get('/api/kardex/products?categoryId=nada')).status).toBe(400);
    expect((await request(app).get('/api/kardex/products?pageSize=500')).status).toBe(400);
    expect((await request(app).get('/api/kardex/products?limit=500')).status).toBe(400);
  });
});

describe('GET /api/kardex/movements (vista general, sin producto elegido)', () => {
  it('lista los movimientos de todos los productos, del más reciente, con el resumen de hoy', async () => {
    const { app, repository, requestedBusinesses } = buildApp();
    const now = Date.now();
    const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

    repository.movements.set(KARDEX_PRODUCT_ID, [
      kardexMovement({
        id: 'a',
        type: 'ENTRY',
        quantity: 24,
        stockBefore: 0,
        stockAfter: 24,
        at: minutesAgo(2),
        reason: 'Recepción PED-0415 · Factura 45902',
        purchaseOrder: { id: 'po', number: 415 },
        receipt: { invoiceNumber: '45902' },
      }),
      // Hace más de dos días: no cuenta en el resumen de hoy.
      kardexMovement({
        id: 'old',
        type: 'ENTRY',
        quantity: 5,
        stockBefore: 0,
        stockAfter: 5,
        at: '2020-01-01T15:00:00Z',
        reason: 'Stock inicial',
      }),
    ]);
    repository.movements.set(KARDEX_EMPTY_PRODUCT_ID, [
      kardexMovement({
        id: 'b',
        type: 'EXIT',
        quantity: 13,
        stockBefore: 20,
        stockAfter: 7,
        at: minutesAgo(1),
        reason: 'Venta #5402',
        sale: { id: 'sale', number: 5402 },
      }),
    ]);

    const response = await request(app).get('/api/kardex/movements').expect(200);
    const page = response.body.data;

    expect(page.items.map((item: { id: string }) => item.id)).toEqual(['b', 'a', 'old']);
    expect(page.items[0]).toMatchObject({
      concept: 'Venta',
      document: '5402',
      exit: 13,
      stockAfter: 7,
      product: { id: KARDEX_EMPTY_PRODUCT_ID, code: 'P002', name: 'Arroz 1 kg' },
    });
    expect(page.items[1]).toMatchObject({ concept: 'Recepción PED-0415', document: '45902' });
    expect(page.today).toEqual({ entries: 24, exits: 13, count: 2 });
    expect(page.total).toBe(3);
    // El negocio sale de la sesión.
    expect(requestedBusinesses).toEqual([TEST_BUSINESS_ID]);
  });

  it('sin movimientos devuelve la lista vacía y el día en cero', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/kardex/movements').expect(200);

    expect(response.body.data).toMatchObject({
      items: [],
      total: 0,
      today: { entries: 0, exits: 0, count: 0 },
    });
  });
});

describe('Entradas / Salidas del historial y lo de hoy (HU-38)', () => {
  it('filtra solo las entradas o solo las salidas; «hoy» suma solo lo de hoy, sin filtro', async () => {
    const { app, repository } = buildApp();

    repository.movements.set(KARDEX_PRODUCT_ID, [
      kardexMovement({
        id: 'a',
        type: 'ENTRY',
        quantity: 12,
        stockBefore: 0,
        stockAfter: 12,
        at: '2026-10-01T15:00:00Z',
      }),
      kardexMovement({
        id: 'b',
        type: 'EXIT',
        quantity: 2,
        stockBefore: 12,
        stockAfter: 10,
        at: '2026-10-02T15:00:00Z',
      }),
      // Un conteo que bajó el stock cuenta como salida.
      kardexMovement({
        id: 'c',
        type: 'ADJUSTMENT',
        quantity: 1,
        stockBefore: 10,
        stockAfter: 9,
        at: '2026-10-03T15:00:00Z',
      }),
      // Lo de hoy: una entrada de 5.
      kardexMovement({
        id: 'd',
        type: 'ENTRY',
        quantity: 5,
        stockBefore: 9,
        stockAfter: 14,
        at: new Date().toISOString(),
      }),
    ]);

    const exits = await request(app).get(`${PRODUCT}/movements?direction=exits`).expect(200);
    const entries = await request(app).get(`${PRODUCT}/movements?direction=entries`).expect(200);

    expect(exits.body.data.items.map((item: { id: string }) => item.id)).toEqual(['c', 'b']);
    // «Hoy» no depende del filtro: solo la entrada de hoy.
    expect(exits.body.data.today).toEqual({ entries: 5, exits: 0, count: 1 });
    expect(entries.body.data.items.map((item: { id: string }) => item.id)).toEqual(['d', 'a']);
    await request(app).get(`${PRODUCT}/movements?direction=todo`).expect(400);
  });
});

describe('POST /api/kardex/products/:productId/entries (ingreso sin pedido, HU-38)', () => {
  const SUPPLIER = '0b000000-0000-4000-8000-0000000000c1';
  const body = (overrides: Record<string, unknown> = {}) => ({
    supplierId: SUPPLIER,
    invoiceNumber: '45991',
    documentDate: '2026-11-01',
    quantity: 12,
    unitCost: '4850.00',
    ...overrides,
  });

  it('el Encargado y la Bodega lo registran: compra directa con factura, costo y proveedor', async () => {
    for (const role of ['ENCARGADO', 'BODEGA'] as const) {
      const { app, repository } = buildApp(role);

      repository.activeSuppliers.add(SUPPLIER);
      await request(app).post(`${PRODUCT}/entries`).send(body()).expect(201);
      expect(repository.entries[0]).toMatchObject({
        productId: KARDEX_PRODUCT_ID,
        // El producto del doble no vence: sin lote escrito, el lote es la factura.
        lots: [{ lotNumber: '45991', expirationDate: null, quantity: 12 }],
        movement: {
          reason: 'Compra directa',
          documentNumber: '45991',
          unitCost: '4850.00',
          supplierId: SUPPLIER,
        },
      });
    }
  });

  it.each([
    ['sin referencia', { invoiceNumber: '  ' }, 'invoiceNumber', 'Indique el número de factura.'],
    ['con 0 unidades', { quantity: 0 }, 'quantity', 'La cantidad debe ser mayor que 0.'],
    ['con unidades negativas', { quantity: -3 }, 'quantity', 'La cantidad debe ser mayor que 0.'],
    [
      'sin costo válido',
      { unitCost: 'abc' },
      'unitCost',
      'El costo unitario debe ser un monto válido (hasta 2 decimales).',
    ],
  ])('no guarda la entrada %s', async (_case, overrides, field, message) => {
    const { app, repository } = buildApp();

    repository.activeSuppliers.add(SUPPLIER);

    const response = await request(app)
      .post(`${PRODUCT}/entries`)
      .send(body(overrides))
      .expect(400);

    expect(response.body.error.details[field]).toContain(message);
    expect(repository.entries).toHaveLength(0);
  });

  it('rechaza un proveedor inactivo o ajeno, una factura del futuro y un producto que vence sin lote', async () => {
    const { app, repository } = buildApp();

    await request(app).post(`${PRODUCT}/entries`).send(body()).expect(400);
    repository.activeSuppliers.add(SUPPLIER);
    await request(app)
      .post(`${PRODUCT}/entries`)
      .send(body({ documentDate: '2999-01-01' }))
      .expect(400);
    repository.products.set(KARDEX_PRODUCT_ID, kardexProduct({ perishable: true }));

    const perishable = await request(app).post(`${PRODUCT}/entries`).send(body()).expect(400);

    expect(perishable.body.error.message).toBe(
      'Indique el lote y la fecha de vencimiento de Café molido 500 g.',
    );
    expect(repository.entries).toHaveLength(0);
  });
});

describe('POST /api/kardex/products/:productId/exits (egreso de un lote, HU-38)', () => {
  const LOT = '0c000000-0000-4000-8000-0000000000d1';
  const body = (overrides: Record<string, unknown> = {}) => ({
    concept: 'EXPIRED',
    documentNumber: '44',
    lotId: LOT,
    quantity: 4,
    detail: 'botellas vencidas retiradas de la góndola',
    ...overrides,
  });

  it('saca las unidades del lote elegido con su concepto, documento y detalle', async () => {
    const { app, repository } = buildApp();

    repository.stockLots.set(KARDEX_PRODUCT_ID, [
      {
        id: LOT,
        lotNumber: 'L-2409C',
        expirationDate: new Date('2028-01-06T00:00:00Z'),
        quantity: 30,
      },
    ]);
    await request(app).post(`${PRODUCT}/exits`).send(body()).expect(201);
    expect(repository.exits[0]).toEqual({
      productId: KARDEX_PRODUCT_ID,
      plan: {
        lotId: LOT,
        quantity: 4,
        reason: 'Vencido / descartado',
        documentNumber: '44',
        detail: 'botellas vencidas retiradas de la góndola',
      },
    });
  });

  it('no deja sacar más de lo que tiene el lote, ni de un lote ajeno, ni sin documento', async () => {
    const { app, repository } = buildApp();

    repository.stockLots.set(KARDEX_PRODUCT_ID, [
      { id: LOT, lotNumber: 'L-2409C', expirationDate: null, quantity: 3 },
    ]);

    const tooMany = await request(app).post(`${PRODUCT}/exits`).send(body()).expect(400);

    expect(tooMany.body.error.message).toBe('Del lote L-2409C quedan 3: no puede salir más.');
    await request(app)
      .post(`${PRODUCT}/exits`)
      .send(body({ lotId: '0c000000-0000-4000-8000-0000000000ff', quantity: 1 }))
      .expect(400);
    await request(app)
      .post(`${PRODUCT}/exits`)
      .send(body({ documentNumber: '', quantity: 1 }))
      .expect(400);
    await request(app)
      .post(`${PRODUCT}/exits`)
      .send(body({ concept: 'VENTA', quantity: 1 }))
      .expect(400);
    expect(repository.exits).toHaveLength(0);
  });
});
