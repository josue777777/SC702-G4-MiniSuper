import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Role } from '../auth/permissions.js';
import { errorHandler } from '../middleware/error-handler.middleware.js';
import { requirePermission } from '../middleware/require-auth.middleware.js';
import { fakeSession, TEST_BUSINESS_ID } from '../testing/fake-session.js';
import {
  CREDIT_CUSTOMER_ID,
  CREDIT_FOREIGN_CUSTOMER_ID,
  FakeCreditRepository,
  creditSale,
} from '../testing/credit.repository.fake.js';
import { createCustomersRouter } from './customers.routes.js';

/**
 * Cuentas por cobrar y abonos (HU-19): rutas reales con repositorio falso,
 * montadas con el mismo permiso con que `routes/index.ts` las publica.
 */

function buildApp(role: Role = 'ENCARGADO') {
  const repository = new FakeCreditRepository();
  const requestedBusinesses: string[] = [];
  const app = express();

  repository
    .ledgerOf(CREDIT_CUSTOMER_ID)
    .sales.push(
      creditSale('s12', 12, '2026-10-01T18:00:00Z', '6000'),
      creditSale('s15', 15, '2026-10-05T18:00:00Z', '3000'),
    );
  app.use(express.json());
  app.use(
    '/api/customers',
    fakeSession(TEST_BUSINESS_ID, role),
    requirePermission('customers'),
    createCustomersRouter(
      () => ({}) as never,
      (id) => {
        requestedBusinesses.push(id);

        return repository as never;
      },
    ),
  );
  app.use(errorHandler);

  return { app, repository, requestedBusinesses };
}

const CREDIT = `/api/customers/${CREDIT_CUSTOMER_ID}/credit`;
const PAYMENTS = `/api/customers/${CREDIT_CUSTOMER_ID}/payments`;
const body = (overrides: Record<string, unknown> = {}) => ({
  idempotencyKey: randomUUID(),
  amount: '4000.00',
  ...overrides,
});

describe('permisos', () => {
  it.each(['ENCARGADO', 'CAJERO'] as const)(
    'el rol %s consulta la deuda y registra abonos',
    async (role) => {
      const { app } = buildApp(role);

      expect((await request(app).get(CREDIT)).status).toBe(200);
      expect((await request(app).get(PAYMENTS)).status).toBe(200);
      expect((await request(app).post(PAYMENTS).send(body())).status).toBe(201);
    },
  );

  it.each(['BODEGA', 'ADMIN'] as const)('el rol %s recibe 403 y no toca datos', async (role) => {
    const { app, repository, requestedBusinesses } = buildApp(role);

    expect((await request(app).get(CREDIT)).status).toBe(403);
    expect((await request(app).get(PAYMENTS)).status).toBe(403);
    expect((await request(app).post(PAYMENTS).send(body())).status).toBe(403);
    expect(requestedBusinesses).toEqual([]);
    expect(repository.recordCalls).toBe(0);
  });

  it('el negocio y el usuario salen de la sesión: un businessId en el cuerpo se rechaza', async () => {
    const { app, repository } = buildApp();
    const forged = await request(app)
      .post(PAYMENTS)
      .send(body({ businessId: '0b000000-0000-4000-8000-0000000000ff' }));

    expect(forged.status).toBe(400);
    expect(repository.recordCalls).toBe(0);
  });
});

describe('GET deuda e historial', () => {
  it('devuelve la deuda sin guardarla en caché', async () => {
    const { app } = buildApp();
    const response = await request(app).get(CREDIT);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toMatchObject({
      balance: '9000.00',
      hasCredit: true,
      settled: false,
    });
    expect(response.body.data.fiados).toHaveLength(2);
  });

  it('un cliente inexistente o con id mal formado responde 404 o 400', async () => {
    const { app } = buildApp();

    expect(
      (await request(app).get(`/api/customers/${CREDIT_FOREIGN_CUSTOMER_ID}/credit`)).status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/customers/${CREDIT_FOREIGN_CUSTOMER_ID}/payments`)).status,
    ).toBe(404);
    expect((await request(app).get('/api/customers/no-es-un-uuid/credit')).status).toBe(400);
  });
});

describe('POST /api/customers/:id/payments', () => {
  it('registra el abono (201) y devuelve la ficha actualizada', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post(PAYMENTS)
      .send(body({ paymentDate: '2026-10-20', notes: 'En efectivo' }));

    expect(response.status).toBe(201);
    expect(response.body.data.replayed).toBe(false);
    expect(response.body.data.payment).toMatchObject({
      amount: '4000.00',
      paymentDate: '2026-10-20',
      notes: 'En efectivo',
    });
    expect(response.body.data.credit).toMatchObject({ balance: '5000.00', totalPaid: '4000.00' });
  });

  it('el mismo envío repetido responde 200 con replayed y no cobra dos veces', async () => {
    const { app, repository } = buildApp();
    const payload = body();
    const first = await request(app).post(PAYMENTS).send(payload);
    const second = await request(app).post(PAYMENTS).send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.replayed).toBe(true);
    expect(second.body.data.payment.id).toBe(first.body.data.payment.id);
    expect(repository.operations).toHaveLength(1);

    // La misma llave con otro monto: 409.
    const reused = await request(app)
      .post(PAYMENTS)
      .send({ ...payload, amount: '1.00' });

    expect(reused.status).toBe(409);
    expect(reused.body.error.details.reason).toBe('KEY_REUSED');
  });

  it.each([
    ['monto cero', { amount: '0' }],
    ['monto cero con decimales', { amount: '0.00' }],
    ['monto negativo', { amount: '-5' }],
    ['más de dos decimales', { amount: '10.123' }],
    ['monto con letras', { amount: 'abc' }],
    ['monto vacío', { amount: '' }],
    ['monto numérico en lugar de texto', { amount: 4000 }],
    ['sin monto', { amount: undefined }],
    ['fecha con formato inválido', { paymentDate: '03/11/2026' }],
    ['fecha inexistente', { paymentDate: '2026-02-30' }],
    ['llave inválida', { idempotencyKey: 'no-es-un-uuid' }],
    ['fiado con id inválido', { saleId: 'abc' }],
    ['nota demasiado larga', { notes: 'x'.repeat(201) }],
    ['campo desconocido', { cliente: 'otro' }],
  ])('rechaza con 400: %s', async (_name, overrides) => {
    const { app, repository } = buildApp();
    const response = await request(app).post(PAYMENTS).send(body(overrides));

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('Los datos enviados no son válidos.');
    expect(repository.recordCalls).toBe(0);
  });

  it('un pago superior a la deuda responde 409 con la diferencia', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post(PAYMENTS)
      .send(body({ amount: '12000.00' }));

    expect(response.status).toBe(409);
    expect(response.body.error.details).toMatchObject({
      reason: 'EXCEEDS_DEBT',
      balance: '9000.00',
      excess: '3000.00',
    });
  });

  it('un cliente inexistente responde 404 y un fiado ajeno también', async () => {
    const { app } = buildApp();

    expect(
      (
        await request(app)
          .post(`/api/customers/${CREDIT_FOREIGN_CUSTOMER_ID}/payments`)
          .send(body())
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(PAYMENTS)
          .send(body({ saleId: randomUUID() }))
      ).status,
    ).toBe(404);
  });
});
