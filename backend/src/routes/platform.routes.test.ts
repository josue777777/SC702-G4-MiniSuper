import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Role } from '../auth/permissions.js';
import { errorHandler } from '../middleware/error-handler.middleware.js';
import {
  createRequireAuth,
  requireBusiness,
  requirePasswordChanged,
  requirePermission,
} from '../middleware/require-auth.middleware.js';
import { createSameOriginGuard } from '../middleware/same-origin.middleware.js';
import { AuthService } from '../services/auth.service.js';
import { TEST_BUSINESS_ID } from '../testing/fake-session.js';
import { FakePlatformRepository } from '../testing/platform.repository.fake.js';
import { FakeUsersRepository, makeUser } from '../testing/users.repository.fake.js';
import { LoginRateLimiter } from '../utils/login-rate-limiter.js';
import { hashPassword } from '../utils/password.js';
import { createAuthRouter } from './auth.routes.js';
import { createPlatformRouters } from './platform.routes.js';

/**
 * HTTP de la plataforma (ADR 0002): solo el Administrador maneja negocios,
 * planes y la bandeja de solicitudes; el Encargado pide más usuarios para el
 * suyo.
 */

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'ClaveSegura123';
const ROLES: Role[] = ['ADMIN', 'ENCARGADO', 'CAJERO', 'BODEGA'];

let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

function buildApp() {
  const users = new FakeUsersRepository(
    ROLES.map((role, index) =>
      makeUser({
        id: `${index + 1}`.repeat(8) + '-1111-4111-8111-111111111111',
        email: `${role.toLowerCase()}@correo.cr`,
        role,
        passwordHash,
      }),
    ),
  );
  const platform = new FakePlatformRepository();
  const auth = new AuthService(users, {
    sessionSecret: 's'.repeat(40),
    limiter: new LoginRateLimiter(),
  });
  const session = [createSameOriginGuard(ORIGIN), createRequireAuth(auth), requirePasswordChanged];
  const { publicRouter, adminRouter, requestsRouter } = createPlatformRouters(platform);
  const app = express();

  app.use(express.json());
  app.use('/api/auth', createAuthRouter(auth, ORIGIN, false));
  app.use('/api/platform/public', publicRouter);
  app.use('/api/platform', ...session, requirePermission('platform.manage'), adminRouter);
  app.use(
    '/api/plan-requests',
    ...session,
    requireBusiness,
    requirePermission('plan.request'),
    requestsRouter,
  );
  app.use(errorHandler);

  return { app, platform };
}

async function loginAs(role: Role, built = buildApp()) {
  const agent = request.agent(built.app);

  await agent
    .post('/api/auth/login')
    .send({ email: `${role.toLowerCase()}@correo.cr`, password: PASSWORD })
    .expect(200);

  return { agent, ...built };
}

describe('plataforma: solo el Administrador', () => {
  it('sin sesión solo se ve el nombre del sistema', async () => {
    const { app } = buildApp();

    expect((await request(app).get('/api/platform/public')).body.data).toEqual({
      systemName: 'MiniSuper',
    });
    expect((await request(app).get('/api/platform/businesses')).status).toBe(401);
  });

  it.each(['ENCARGADO', 'CAJERO', 'BODEGA'] as const)(
    '%s no entra a la plataforma (403)',
    async (role) => {
      const { agent } = await loginAs(role);

      expect((await agent.get('/api/platform/businesses')).status).toBe(403);
      expect((await agent.put('/api/platform/settings').send({})).status).toBe(403);
    },
  );

  it('el Administrador ve los negocios: plan, uso y Encargado, sin sus datos internos', async () => {
    const { agent } = await loginAs('ADMIN');

    const response = await agent.get('/api/platform/businesses');

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toEqual(
      expect.objectContaining({ name: 'Negocio de prueba', maxUsers: 5, usedSeats: 3 }),
    );
    expect(Object.keys(response.body.data[0])).not.toEqual(
      expect.arrayContaining(['sales', 'products', 'customers']),
    );
  });

  it('crea un negocio con su Encargado y su plan; la contraseña temporal se ve una vez', async () => {
    const { agent, platform } = await loginAs('ADMIN');

    const response = await agent.post('/api/platform/businesses').send({
      businessName: 'Súper La Esquina',
      extraUsers: 0,
      managerName: 'Laura Mora',
      managerEmail: 'laura@laesquina.cr',
    });

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data.business).toEqual(
      expect.objectContaining({ name: 'Súper La Esquina', extraUsers: 0, maxUsers: 1 }),
    );
    expect(response.body.data.manager.temporaryPassword).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(platform.businesses).toHaveLength(2);
  });

  it('no deja crear un negocio con un correo de Encargado que ya existe', async () => {
    const { agent } = await loginAs('ADMIN');

    const response = await agent.post('/api/platform/businesses').send({
      businessName: 'Otro',
      extraUsers: 0,
      managerName: 'Elena',
      managerEmail: 'encargado@correo.cr',
    });

    expect(response.status).toBe(409);
    expect(response.body.error.details.managerEmail).toEqual(['Ese correo ya está en uso.']);
  });

  it('cambia el plan y suspende o reactiva un negocio', async () => {
    const { agent } = await loginAs('ADMIN');

    const plan = await agent
      .patch(`/api/platform/businesses/${TEST_BUSINESS_ID}/plan`)
      .send({ extraUsers: 2 });
    const suspended = await agent.post(`/api/platform/businesses/${TEST_BUSINESS_ID}/suspend`);
    const missing = await agent.post(
      '/api/platform/businesses/0b000000-0000-4000-8000-0000000000ff/suspend',
    );

    expect(plan.body.data).toEqual(expect.objectContaining({ extraUsers: 2, maxUsers: 3 }));
    expect(suspended.body.data.status).toBe('SUSPENDED');
    expect(missing.status).toBe(404);
  });

  it('cambia el nombre del sistema y el precio por usuario (validados)', async () => {
    const { agent, app } = await loginAs('ADMIN');

    const bad = await agent
      .put('/api/platform/settings')
      .send({ systemName: '', pricePerExtraUser: 'gratis' });
    const ok = await agent
      .put('/api/platform/settings')
      .send({ systemName: 'Abarrotes Pro', pricePerExtraUser: '7500' });

    expect(bad.status).toBe(400);
    expect(ok.body.data).toEqual({ systemName: 'Abarrotes Pro', pricePerExtraUser: '7500.00' });
    expect((await request(app).get('/api/platform/public')).body.data.systemName).toBe(
      'Abarrotes Pro',
    );
  });
});

describe('solicitudes de ampliación del plan', () => {
  it('el Encargado pide más usuarios: se cotiza con el precio vigente y llega a la bandeja', async () => {
    const built = buildApp();
    const encargado = await loginAs('ENCARGADO', built);
    const admin = await loginAs('ADMIN', built);

    const created = await encargado.agent
      .post('/api/plan-requests')
      .send({ extraUsers: 3, note: 'Contratamos dos cajeros y un bodeguero' });

    expect(created.status).toBe(201);
    expect(created.body.data).toEqual(
      expect.objectContaining({ extraUsers: 3, monthlyAmount: '15000.00', status: 'PENDING' }),
    );

    const inbox = await admin.agent.get('/api/platform/requests?status=PENDING');

    expect(inbox.body.data).toHaveLength(1);
    expect((await admin.agent.get('/api/platform/businesses')).body.data[0].pendingRequest).toBe(
      true,
    );
  });

  it('solo una solicitud pendiente a la vez', async () => {
    const { agent } = await loginAs('ENCARGADO');

    await agent.post('/api/plan-requests').send({ extraUsers: 1 }).expect(201);

    const second = await agent.post('/api/plan-requests').send({ extraUsers: 1 });

    expect(second.status).toBe(409);
    expect(second.body.error.message).toMatch(/solicitud pendiente/);
  });

  it('al aprobarla, el plan del negocio suma esos usuarios; no se aprueba dos veces', async () => {
    const built = buildApp();
    const encargado = await loginAs('ENCARGADO', built);
    const admin = await loginAs('ADMIN', built);
    const created = await encargado.agent.post('/api/plan-requests').send({ extraUsers: 2 });
    const id = created.body.data.id as string;

    const approved = await admin.agent
      .post(`/api/platform/requests/${id}/approve`)
      .send({ response: 'Listo, ya puede crearlos' });
    const again = await admin.agent.post(`/api/platform/requests/${id}/approve`).send({});

    expect(approved.body.data).toEqual(
      expect.objectContaining({ status: 'APPROVED', response: 'Listo, ya puede crearlos' }),
    );
    expect(built.platform.businesses[0]?.extraUsers).toBe(6);
    expect(again.status).toBe(409);

    const own = await encargado.agent.get('/api/plan-requests');

    expect(own.body.data.requests[0].status).toBe('APPROVED');
    expect(own.body.data.pricePerExtraUser).toBe('5000.00');
  });

  it('al rechazarla el plan no cambia, y la respuesta le llega al Encargado', async () => {
    const built = buildApp();
    const encargado = await loginAs('ENCARGADO', built);
    const admin = await loginAs('ADMIN', built);
    const created = await encargado.agent.post('/api/plan-requests').send({ extraUsers: 2 });

    await admin.agent
      .post(`/api/platform/requests/${created.body.data.id as string}/reject`)
      .send({ response: 'Falta el pago del mes' })
      .expect(200);

    expect(built.platform.businesses[0]?.extraUsers).toBe(4);
    expect((await encargado.agent.get('/api/plan-requests')).body.data.requests[0].response).toBe(
      'Falta el pago del mes',
    );
  });

  it.each(['CAJERO', 'BODEGA', 'ADMIN'] as const)(
    '%s no puede pedir más usuarios (403)',
    async (role) => {
      const { agent } = await loginAs(role);

      expect((await agent.post('/api/plan-requests').send({ extraUsers: 1 })).status).toBe(403);
    },
  );

  it('valida la cantidad pedida', async () => {
    const { agent } = await loginAs('ENCARGADO');

    for (const extraUsers of [0, 1.5, 51, '2']) {
      expect((await agent.post('/api/plan-requests').send({ extraUsers })).status).toBe(400);
    }
  });
});
