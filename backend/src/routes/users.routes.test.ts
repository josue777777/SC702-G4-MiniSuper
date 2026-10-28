import express, { Router } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Role } from '../auth/permissions.js';
import { errorHandler } from '../middleware/error-handler.middleware.js';
import {
  createRequireAuth,
  requirePasswordChanged,
  requirePermission,
} from '../middleware/require-auth.middleware.js';
import { createSameOriginGuard } from '../middleware/same-origin.middleware.js';
import { AuthService } from '../services/auth.service.js';
import { FakeUsersRepository, makeUser } from '../testing/users.repository.fake.js';
import { LoginRateLimiter } from '../utils/login-rate-limiter.js';
import { hashPassword } from '../utils/password.js';
import { createAuthRouter } from './auth.routes.js';
import { createProfileRouter } from './profile.routes.js';
import { createUsersRouter } from './users.routes.js';

/**
 * HTTP de permisos por rol y de Configuración › Usuarios. Se arma la MISMA
 * cadena que `routes/index.ts` (sesión → contraseña cambiada → permiso), con
 * repositorio falso y un módulo de prueba en lugar de pedidos y productos.
 */

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'ClaveSegura123';

const ID: Record<Role | 'TEMP', string> = {
  ADMIN: '11111111-1111-4111-8111-111111111111',
  ENCARGADO: '22222222-2222-4222-8222-222222222222',
  CAJERO: '33333333-3333-4333-8333-333333333333',
  BODEGA: '44444444-4444-4444-8444-444444444444',
  TEMP: '55555555-5555-4555-8555-555555555555',
};

let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

function buildApp() {
  const repository = new FakeUsersRepository([
    makeUser({ id: ID.ADMIN, email: 'admin@correo.cr', role: 'ADMIN', passwordHash }),
    makeUser({ id: ID.ENCARGADO, email: 'encargado@correo.cr', role: 'ENCARGADO', passwordHash }),
    makeUser({ id: ID.CAJERO, email: 'cajero@correo.cr', role: 'CAJERO', passwordHash }),
    makeUser({ id: ID.BODEGA, email: 'bodega@correo.cr', role: 'BODEGA', passwordHash }),
    makeUser({
      id: ID.TEMP,
      email: 'nuevo@correo.cr',
      role: 'CAJERO',
      passwordHash,
      mustChangePassword: true,
    }),
  ]);
  const auth = new AuthService(repository, {
    sessionSecret: 's'.repeat(40),
    limiter: new LoginRateLimiter(),
  });
  const sessionRequired = [
    createSameOriginGuard(ORIGIN),
    createRequireAuth(auth),
    requirePasswordChanged,
  ];
  const fakeModule = Router()
    .get('/', (_req, res) => {
      res.json({ data: 'ok' });
    })
    .post('/', (_req, res) => {
      res.status(201).json({ data: 'ok' });
    });
  const app = express();

  app.use(express.json());
  app.use('/api/auth', createAuthRouter(auth, ORIGIN, false));
  app.use('/api/profile', createProfileRouter(repository, auth, ORIGIN, false));
  app.use(
    '/api/products',
    ...sessionRequired,
    requirePermission('inventory.read', 'inventory.write'),
    fakeModule,
  );
  app.use('/api/purchase-orders', ...sessionRequired, requirePermission('purchasing'), fakeModule);
  app.use('/api/sales', ...sessionRequired, requirePermission('sales'), fakeModule);
  app.use(
    '/api/users',
    ...sessionRequired,
    requirePermission('users.manage'),
    createUsersRouter(repository),
  );
  app.use(errorHandler);

  return { app, repository };
}

async function loginAs(email: string, built = buildApp()) {
  const agent = request.agent(built.app);

  await agent.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);

  return { agent, ...built };
}

describe('permisos por rol en la API', () => {
  it.each([
    ['cajero', 'get', '/api/purchase-orders', 403],
    ['cajero', 'get', '/api/products', 200],
    ['cajero', 'post', '/api/products', 403],
    ['cajero', 'post', '/api/sales', 201],
    ['bodega', 'post', '/api/products', 201],
    ['bodega', 'get', '/api/sales', 403],
    ['encargado', 'get', '/api/purchase-orders', 200],
    ['encargado', 'get', '/api/users', 200],
    ['cajero', 'get', '/api/users', 403],
    ['bodega', 'post', '/api/users', 403],
    ['admin', 'get', '/api/users', 200],
  ] as const)('%s: %s %s responde %i', async (who, method, path, status) => {
    const { agent } = await loginAs(`${who}@correo.cr`);

    const response = await agent[method](path).send({});

    expect(response.status).toBe(status);

    if (status === 403) {
      expect(response.body.error.message).toBe('Su rol no tiene acceso a esta sección.');
    }
  });

  it('el inicio de sesión devuelve el rol y sus permisos', async () => {
    const response = await request(buildApp().app)
      .post('/api/auth/login')
      .send({ email: 'cajero@correo.cr', password: PASSWORD });

    expect(response.body.data).toEqual(
      expect.objectContaining({
        role: 'CAJERO',
        permissions: ['sales', 'customers', 'inventory.read'],
        mustChangePassword: false,
      }),
    );
  });
});

describe('contraseña temporal', () => {
  it('con contraseña temporal solo puede entrar a «Mi perfil» hasta cambiarla', async () => {
    const { agent } = await loginAs('nuevo@correo.cr');

    const blocked = await agent.get('/api/sales');

    expect(blocked.status).toBe(403);
    expect(blocked.body.error.message).toMatch(/contraseña temporal/);
    expect((await agent.get('/api/profile')).status).toBe(200);

    const changed = await agent.patch('/api/profile').send({
      currentPassword: PASSWORD,
      newPassword: 'MiClaveNueva456',
      confirmPassword: 'MiClaveNueva456',
    });

    expect(changed.status).toBe(200);
    expect(changed.body.data.mustChangePassword).toBe(false);

    // La sesión de este navegador se renueva con el cambio: sigue adentro.
    expect((await agent.get('/api/sales')).status).toBe(200);
  });
});

describe('Configuración › Usuarios', () => {
  it('el administrador crea un usuario y recibe su contraseña temporal una sola vez', async () => {
    const built = buildApp();
    const { agent } = await loginAs('admin@correo.cr', built);

    const response = await agent
      .post('/api/users')
      .send({ name: 'Bea Rojas', email: 'bea@correo.cr', role: 'BODEGA' });

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data.user).toEqual(
      expect.objectContaining({ email: 'bea@correo.cr', role: 'BODEGA', mustChangePassword: true }),
    );
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|argon2/);

    // Con esa contraseña temporal el nuevo usuario puede entrar.
    await request(built.app)
      .post('/api/auth/login')
      .send({ email: 'bea@correo.cr', password: response.body.data.temporaryPassword })
      .expect(200);

    const list = await agent.get('/api/users');

    expect(list.body.data).toHaveLength(6);
    expect(JSON.stringify(list.body)).not.toMatch(/passwordHash|argon2/);
  });

  it('valida los datos y el rol', async () => {
    const { agent } = await loginAs('admin@correo.cr');

    const response = await agent
      .post('/api/users')
      .send({ name: 'X', email: 'no-es-correo', role: 'DUENO' });

    expect(response.status).toBe(400);
    expect(Object.keys(response.body.error.details ?? {})).toEqual(
      expect.arrayContaining(['email', 'role']),
    );
  });

  it('al desactivar a un usuario se cierra su sesión abierta y ya no puede entrar', async () => {
    const built = buildApp();
    const admin = await loginAs('admin@correo.cr', built);
    const cajero = await loginAs('cajero@correo.cr', built);

    expect((await cajero.agent.get('/api/sales')).status).toBe(200);

    await admin.agent.post(`/api/users/${ID.CAJERO}/deactivate`).expect(200);

    expect((await cajero.agent.get('/api/sales')).status).toBe(401);
    expect(
      (
        await request(built.app)
          .post('/api/auth/login')
          .send({ email: 'cajero@correo.cr', password: PASSWORD })
      ).status,
    ).toBe(401);
  });

  it('al cambiarle el rol, la sesión abierta se cierra y entra con los permisos nuevos', async () => {
    const built = buildApp();
    const admin = await loginAs('admin@correo.cr', built);
    const cajero = await loginAs('cajero@correo.cr', built);

    await admin.agent.patch(`/api/users/${ID.CAJERO}`).send({ role: 'BODEGA' }).expect(200);

    expect((await cajero.agent.get('/api/purchase-orders')).status).toBe(401);

    const again = await loginAs('cajero@correo.cr', built);

    expect((await again.agent.get('/api/purchase-orders')).status).toBe(200);
  });

  it('rechaza una petición de cambio desde otro origen (CSRF)', async () => {
    const { agent } = await loginAs('admin@correo.cr');

    const response = await agent
      .post(`/api/users/${ID.CAJERO}/deactivate`)
      .set('Origin', 'https://sitio-malicioso.example');

    expect(response.status).toBe(403);
  });

  it('un id inválido responde 400', async () => {
    const { agent } = await loginAs('admin@correo.cr');

    expect((await agent.post('/api/users/x/activate')).status).toBe(400);
  });
});

describe('jerarquía en la API (el Encargado administra solo rangos menores)', () => {
  it('el Encargado crea un Cajero, pero no otro Encargado', async () => {
    const { agent } = await loginAs('encargado@correo.cr');

    const cashier = await agent
      .post('/api/users')
      .send({ name: 'Nuevo Cajero', email: 'nuevo.cajero@correo.cr', role: 'CAJERO' });
    const peer = await agent
      .post('/api/users')
      .send({ name: 'Otro Encargado', email: 'otro.enc@correo.cr', role: 'ENCARGADO' });

    expect(cashier.status).toBe(201);
    expect(peer.status).toBe(403);
    expect(peer.body.error.message).toBe(
      'Solo puede administrar usuarios de un rango menor al suyo.',
    );
  });

  it('el Encargado no ve al Administrador en la lista ni puede desactivarlo', async () => {
    const { agent } = await loginAs('encargado@correo.cr');

    const list = await agent.get('/api/users');
    const roles = (list.body.data as { role: string }[]).map((user) => user.role);

    expect(roles).not.toContain('ADMIN');
    expect((await agent.post(`/api/users/${ID.ADMIN}/deactivate`)).status).toBe(403);
  });

  it('con el plan lleno, el alta responde 409 con el límite', async () => {
    const built = buildApp();

    built.repository.maxUsers = 4;

    const { agent } = await loginAs('encargado@correo.cr', built);
    const response = await agent
      .post('/api/users')
      .send({ name: 'Una más', email: 'una.mas@correo.cr', role: 'BODEGA' });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toMatch(/El plan permite 4 usuarios activos/);
  });
});
