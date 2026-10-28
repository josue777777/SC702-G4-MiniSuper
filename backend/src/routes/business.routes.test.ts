import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Role } from '../auth/permissions.js';
import { errorHandler } from '../middleware/error-handler.middleware.js';
import {
  createRequireAuth,
  requireBusiness,
  requirePasswordChanged,
} from '../middleware/require-auth.middleware.js';
import { createSameOriginGuard } from '../middleware/same-origin.middleware.js';
import { AuthService } from '../services/auth.service.js';
import { FakeBusinessRepository } from '../testing/business.repository.fake.js';
import { FakeUsersRepository, makeUser } from '../testing/users.repository.fake.js';
import { LoginRateLimiter } from '../utils/login-rate-limiter.js';
import { hashPassword } from '../utils/password.js';
import { createAuthRouter } from './auth.routes.js';
import { createBusinessRouter } from './business.routes.js';

/**
 * HTTP de Configuración › General del negocio de la sesión: leer, cualquier
 * usuario del negocio; datos y logo, solo el Encargado; la plataforma no entra.
 */

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

/** PNG mínimo válido: la firma de 8 bytes y un poco de contenido. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

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
  const app = express();

  app.use(express.json());
  app.use('/api/auth', createAuthRouter(auth, ORIGIN, false));
  app.use(
    '/api/business',
    createSameOriginGuard(ORIGIN),
    createRequireAuth(auth),
    requirePasswordChanged,
    requireBusiness,
    createBusinessRouter(() => business, users),
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
  it('sin sesión responde 401', async () => {
    expect((await request(buildApp().app).get('/api/business')).status).toBe(401);
  });

  it.each(['ENCARGADO', 'CAJERO', 'BODEGA'] as const)(
    '%s lee los datos de su negocio (el comprobante los usa)',
    async (role) => {
      const { agent } = await loginAs(role);

      const response = await agent.get('/api/business');

      expect(response.status).toBe(200);
      expect(response.body.data.receiptMessage).toBe('¡Gracias por su compra!');
    },
  );

  it('la plataforma (Administrador) no entra a los datos de un negocio (403)', async () => {
    const { agent } = await loginAs('ADMIN');

    const response = await agent.get('/api/business');

    expect(response.status).toBe(403);
    expect(response.body.error.message).toMatch(/plataforma no accede/);
  });

  it.each(['CAJERO', 'BODEGA'] as const)('%s no puede modificarlos (403)', async (role) => {
    const { agent, business } = await loginAs(role);

    const response = await agent.put('/api/business').send(UPDATE);

    expect(response.status).toBe(403);
    expect(business.current.name).toBe('Abastecedor Nuevo Amanecer');
  });

  it('el Encargado los guarda', async () => {
    const { agent, business } = await loginAs('ENCARGADO');

    const saved = await agent.put('/api/business').send(UPDATE);

    expect(saved.status).toBe(200);
    expect(saved.body.data).toEqual(expect.objectContaining(UPDATE));
    expect(business.current.name).toBe('Súper La Esquina');
  });

  it('valida los datos y responde 400 con el error de cada campo', async () => {
    const { agent, business } = await loginAs('ENCARGADO');

    const response = await agent.put('/api/business').send({ ...UPDATE, name: '', email: 'x' });

    expect(response.status).toBe(400);
    expect(Object.keys(response.body.error.details)).toEqual(
      expect.arrayContaining(['name', 'email']),
    );
    expect(business.current.name).toBe('Abastecedor Nuevo Amanecer');
  });

  it('rechaza un cambio pedido desde otro origen (CSRF)', async () => {
    const { agent } = await loginAs('ENCARGADO');

    const response = await agent
      .put('/api/business')
      .set('Origin', 'https://sitio-malicioso.example')
      .send(UPDATE);

    expect(response.status).toBe(403);
  });

  it('muestra el plan: el Encargado más sus adicionales, y los cupos en uso', async () => {
    const { agent } = await loginAs('CAJERO');

    const response = await agent.get('/api/business');

    // 4 adicionales + el Encargado = 5. Encargado, Cajero y Bodega ocupan 3.
    expect(response.body.data.plan).toEqual({ extraUsers: 4, maxUsers: 5, usedSeats: 3 });
  });
});

describe('logo del negocio', () => {
  it('el Encargado sube el logo y lo ve cualquiera de su negocio', async () => {
    const built = buildApp();
    const encargado = await loginAs('ENCARGADO', built);
    const cajero = await loginAs('CAJERO', built);

    const saved = await encargado.agent
      .put('/api/business/logo')
      .set('Content-Type', 'image/png')
      .send(PNG);

    expect(saved.status).toBe(200);
    expect(saved.body.data.logoUrl).toMatch(/^\/api\/business\/logo\?v=\d+$/);

    const image = await cajero.agent.get('/api/business/logo');

    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(image.body as Buffer, PNG)).toBe(0);
  });

  it('rechaza un archivo que dice ser PNG pero no lo es, SVG y más de 1 MB', async () => {
    const { agent, business } = await loginAs('ENCARGADO');

    const fake = await agent
      .put('/api/business/logo')
      .set('Content-Type', 'image/png')
      .send(Buffer.from('<svg onload="alert(1)"></svg>'));
    const svg = await agent
      .put('/api/business/logo')
      .set('Content-Type', 'image/svg+xml')
      .send(Buffer.from('<svg></svg>'));
    const huge = await agent
      .put('/api/business/logo')
      .set('Content-Type', 'image/png')
      .send(Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]));

    expect([fake.status, svg.status, huge.status]).toEqual([400, 400, 413]);
    expect(business.logo).toBeNull();
  });

  it('el Cajero no puede cambiar ni quitar el logo; quitarlo deja la URL en null', async () => {
    const built = buildApp();
    const cajero = await loginAs('CAJERO', built);
    const encargado = await loginAs('ENCARGADO', built);

    expect(
      (await cajero.agent.put('/api/business/logo').set('Content-Type', 'image/png').send(PNG))
        .status,
    ).toBe(403);
    await encargado.agent.put('/api/business/logo').set('Content-Type', 'image/png').send(PNG);
    expect((await cajero.agent.delete('/api/business/logo')).status).toBe(403);

    const removed = await encargado.agent.delete('/api/business/logo');

    expect(removed.body.data.logoUrl).toBeNull();
    expect((await cajero.agent.get('/api/business/logo')).status).toBe(404);
  });
});
