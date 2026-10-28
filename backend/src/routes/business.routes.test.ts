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

/**
 * HTTP de Configuración › General: leer cualquier rol; datos y logo,
 * Administrador y Encargado; el plan, solo el Administrador.
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
  const { router, publicRouter } = createBusinessRouters(business, users);
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
    expect(publicData.body.data).toEqual({ name: 'Abastecedor Nuevo Amanecer', logoUrl: null });
    expect((await request(app).get('/api/business')).status).toBe(401);
  });

  it.each(ROLES)('%s puede leer los datos (los usa el comprobante)', async (role) => {
    const { agent } = await loginAs(role);

    const response = await agent.get('/api/business');

    expect(response.status).toBe(200);
    expect(response.body.data.receiptMessage).toBe('¡Gracias por su compra!');
  });

  it.each(['CAJERO', 'BODEGA'] as const)('%s no puede modificarlos (403)', async (role) => {
    const { agent, business } = await loginAs(role);

    const response = await agent.put('/api/business').send(UPDATE);

    expect(response.status).toBe(403);
    expect(business.current.name).toBe('Abastecedor Nuevo Amanecer');
  });

  it.each(['ADMIN', 'ENCARGADO'] as const)(
    '%s los guarda y se ven en la lectura pública',
    async (role) => {
      const built = buildApp();
      const { agent } = await loginAs(role, built);

      const saved = await agent.put('/api/business').send(UPDATE);

      expect(saved.status).toBe(200);
      expect(saved.body.data).toEqual(expect.objectContaining(UPDATE));
      expect((await request(built.app).get('/api/business/public')).body.data).toEqual({
        name: 'Súper La Esquina',
        logoUrl: null,
      });
    },
  );

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

/** PNG mínimo válido: la firma de 8 bytes y un poco de contenido. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe('logo del negocio', () => {
  it('el Encargado sube el logo; queda público (login) y en la URL de los datos', async () => {
    const built = buildApp();
    const { agent } = await loginAs('ENCARGADO', built);

    const saved = await agent.put('/api/business/logo').set('Content-Type', 'image/png').send(PNG);

    expect(saved.status).toBe(200);
    expect(saved.body.data.logoUrl).toMatch(/^\/api\/business\/public\/logo\?v=\d+$/);

    const image = await request(built.app).get('/api/business/public/logo');

    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(image.body as Buffer, PNG)).toBe(0);
  });

  it('rechaza un archivo que dice ser PNG pero no lo es', async () => {
    const { agent, business } = await loginAs('ADMIN');

    const response = await agent
      .put('/api/business/logo')
      .set('Content-Type', 'image/png')
      .send(Buffer.from('<svg onload="alert(1)"></svg>'));

    expect(response.status).toBe(400);
    expect(business.logo).toBeNull();
  });

  it('rechaza SVG y archivos de más de 1 MB', async () => {
    const { agent } = await loginAs('ADMIN');

    const svg = await agent
      .put('/api/business/logo')
      .set('Content-Type', 'image/svg+xml')
      .send(Buffer.from('<svg></svg>'));
    const huge = await agent
      .put('/api/business/logo')
      .set('Content-Type', 'image/png')
      .send(Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]));

    expect(svg.status).toBe(400);
    expect(huge.status).toBe(413);
  });

  it('el Cajero no puede cambiar ni quitar el logo; quitarlo deja la URL en null', async () => {
    const built = buildApp();
    const cajero = await loginAs('CAJERO', built);
    const admin = await loginAs('ADMIN', built);

    expect(
      (await cajero.agent.put('/api/business/logo').set('Content-Type', 'image/png').send(PNG))
        .status,
    ).toBe(403);
    await admin.agent.put('/api/business/logo').set('Content-Type', 'image/png').send(PNG);
    expect((await cajero.agent.delete('/api/business/logo')).status).toBe(403);

    const removed = await admin.agent.delete('/api/business/logo');

    expect(removed.body.data.logoUrl).toBeNull();
    expect((await request(built.app).get('/api/business/public/logo')).status).toBe(404);
  });
});

describe('plan contratado (límite de usuarios)', () => {
  it('los datos muestran el límite y los cupos en uso (los administradores no cuentan)', async () => {
    const { agent } = await loginAs('ENCARGADO');

    const response = await agent.get('/api/business');

    expect(response.body.data.plan).toEqual({ maxUsers: 5, usedSeats: 3 });
  });

  it('solo el Administrador cambia el límite; el Encargado recibe 403', async () => {
    const built = buildApp();
    const encargado = await loginAs('ENCARGADO', built);
    const admin = await loginAs('ADMIN', built);

    expect((await encargado.agent.put('/api/business/plan').send({ maxUsers: 50 })).status).toBe(
      403,
    );

    const updated = await admin.agent.put('/api/business/plan').send({ maxUsers: 8 });

    expect(updated.status).toBe(200);
    expect(updated.body.data.plan.maxUsers).toBe(8);
    expect(built.business.current.maxUsers).toBe(8);
  });

  it('valida el límite: entero de 1 a 500', async () => {
    const { agent } = await loginAs('ADMIN');

    for (const maxUsers of [0, 1.5, 501, '5']) {
      expect((await agent.put('/api/business/plan').send({ maxUsers })).status).toBe(400);
    }
  });
});
