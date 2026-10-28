import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Role } from '../auth/permissions.js';
import { errorHandler } from '../middleware/error-handler.middleware.js';
import {
  createRequireAuth,
  requirePasswordChanged,
} from '../middleware/require-auth.middleware.js';
import { createSameOriginGuard } from '../middleware/same-origin.middleware.js';
import { AuthService } from '../services/auth.service.js';
import { FakeBusinessRepository } from '../testing/business.repository.fake.js';
import { FakeUsersRepository, makeUser } from '../testing/users.repository.fake.js';
import { LoginRateLimiter } from '../utils/login-rate-limiter.js';
import { hashPassword } from '../utils/password.js';
import { createAuthRouter } from './auth.routes.js';
import { createBusinessRouters } from './business.routes.js';

/** HTTP de Configuración › General: leer cualquier rol, cambiar solo el Administrador. */

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'ClaveSegura123';
const ROLES: Role[] = ['ADMIN', 'ENCARGADO', 'CAJERO', 'BODEGA'];

const UPDATE = {
  name: 'Súper La Esquina',
  legalId: '3-101-654321',
  phone: '2222-3333',
  email: 'info@laesquina.cr',
  address: 'Cartago centro',
  receiptMessage: 'Vuelva pronto',
};

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
  const business = new FakeBusinessRepository();
  const auth = new AuthService(users, {
    sessionSecret: 's'.repeat(40),
    limiter: new LoginRateLimiter(),
  });
  const { router, publicRouter } = createBusinessRouters(business);
  const app = express();

  app.use(express.json());
  app.use('/api/auth', createAuthRouter(auth, ORIGIN, false));
  app.use('/api/business/public', publicRouter);
  app.use(
    '/api/business',
    createSameOriginGuard(ORIGIN),
    createRequireAuth(auth),
    requirePasswordChanged,
    router,
  );
  app.use(errorHandler);

  return { app, business };
}

async function loginAs(role: Role, built = buildApp()) {
  const agent = request.agent(built.app);

  await agent
    .post('/api/auth/login')
    .send({ email: `${role.toLowerCase()}@correo.cr`, password: PASSWORD })
    .expect(200);

  return { agent, ...built };
}

describe('datos del negocio', () => {
  it('sin sesión solo se ve el nombre (para el login)', async () => {
    const { app } = buildApp();

    const publicData = await request(app).get('/api/business/public');

    expect(publicData.status).toBe(200);
    expect(publicData.body.data).toEqual({ name: 'Abastecedor Nuevo Amanecer' });
    expect((await request(app).get('/api/business')).status).toBe(401);
  });

  it.each(ROLES)('%s puede leer los datos (los usa el comprobante)', async (role) => {
    const { agent } = await loginAs(role);

    const response = await agent.get('/api/business');

    expect(response.status).toBe(200);
    expect(response.body.data.receiptMessage).toBe('¡Gracias por su compra!');
  });

  it.each(['ENCARGADO', 'CAJERO', 'BODEGA'] as const)(
    '%s no puede modificarlos (403)',
    async (role) => {
      const { agent, business } = await loginAs(role);

      const response = await agent.put('/api/business').send(UPDATE);

      expect(response.status).toBe(403);
      expect(business.current.name).toBe('Abastecedor Nuevo Amanecer');
    },
  );

  it('el Administrador los guarda y se ven en la lectura pública', async () => {
    const built = buildApp();
    const { agent } = await loginAs('ADMIN', built);

    const saved = await agent.put('/api/business').send(UPDATE);

    expect(saved.status).toBe(200);
    expect(saved.body.data).toEqual(UPDATE);
    expect((await request(built.app).get('/api/business/public')).body.data).toEqual({
      name: 'Súper La Esquina',
    });
  });

  it('valida los datos y responde 400 con el error de cada campo', async () => {
    const { agent, business } = await loginAs('ADMIN');

    const response = await agent.put('/api/business').send({ ...UPDATE, name: '', email: 'x' });

    expect(response.status).toBe(400);
    expect(Object.keys(response.body.error.details)).toEqual(
      expect.arrayContaining(['name', 'email']),
    );
    expect(business.current.name).toBe('Abastecedor Nuevo Amanecer');
  });

  it('rechaza un cambio pedido desde otro origen (CSRF)', async () => {
    const { agent } = await loginAs('ADMIN');

    const response = await agent
      .put('/api/business')
      .set('Origin', 'https://sitio-malicioso.example')
      .send(UPDATE);

    expect(response.status).toBe(403);
  });
});
