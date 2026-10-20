import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../middleware/error-handler.middleware.js';
import { AuthService } from '../services/auth.service.js';
import { FakeUsersRepository } from '../testing/users.repository.fake.js';
import { LoginRateLimiter } from '../utils/login-rate-limiter.js';
import { createAuthRouter } from './auth.routes.js';
import { createProfileRouter } from './profile.routes.js';

/** HTTP de la cuenta única (HU-12), del perfil (HU-14) y del cierre de sesión (HU-15), con repositorio falso. */

const ORIGIN = 'http://localhost:5173';
const OWNER = { name: 'Ana Pérez', email: 'ana@correo.cr', password: 'ClaveSegura123' };

function buildApp() {
  const repository = new FakeUsersRepository();
  const auth = new AuthService(repository, {
    sessionSecret: 's'.repeat(40),
    requireSetupToken: false,
    limiter: new LoginRateLimiter(),
  });
  const app = express();

  app.use(express.json());
  app.use('/api/auth', createAuthRouter(auth, ORIGIN, false));
  app.use('/api/profile', createProfileRouter(repository, auth, ORIGIN, false));
  app.use(errorHandler);

  return { app, repository };
}

async function loggedInAgent() {
  const { app, repository } = buildApp();
  const agent = request.agent(app);

  await agent.post('/api/auth/setup').send(OWNER).expect(201);
  await agent
    .post('/api/auth/login')
    .send({ email: OWNER.email, password: OWNER.password })
    .expect(200);

  return { agent, app, repository };
}

describe('GET /api/auth/setup-status', () => {
  it('informa que falta configurar y luego que ya está configurado', async () => {
    const { app } = buildApp();

    expect((await request(app).get('/api/auth/setup-status')).body).toEqual({
      data: { configured: false, tokenRequired: false },
    });

    await request(app).post('/api/auth/setup').send(OWNER).expect(201);

    expect((await request(app).get('/api/auth/setup-status')).body.data.configured).toBe(true);
  });
});

describe('POST /api/auth/setup', () => {
  it('responde 201 con el dueño, sin hash, y guarda la contraseña con Argon2id', async () => {
    const { app, repository } = buildApp();

    const response = await request(app).post('/api/auth/setup').send(OWNER);

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(
      expect.objectContaining({ name: 'Ana Pérez', email: 'ana@correo.cr' }),
    );
    expect(JSON.stringify(response.body)).not.toContain('argon2');
    expect(repository.stored[0]?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('responde 400 ante correo inválido o contraseña débil', async () => {
    const { app, repository } = buildApp();

    const badEmail = await request(app)
      .post('/api/auth/setup')
      .send({ ...OWNER, email: 'x' });
    const weak = await request(app)
      .post('/api/auth/setup')
      .send({ ...OWNER, password: 'corta' });

    expect(badEmail.status).toBe(400);
    expect(weak.status).toBe(400);
    expect(repository.stored).toHaveLength(0);
  });

  it('rechaza con 409 un segundo registro', async () => {
    const { app, repository } = buildApp();
    await request(app).post('/api/auth/setup').send(OWNER).expect(201);

    const second = await request(app)
      .post('/api/auth/setup')
      .send({ ...OWNER, email: 'otro@correo.cr' });

    expect(second.status).toBe(409);
    expect(repository.stored).toHaveLength(1);
  });

  it('rechaza con 403 una petición de otro origen (CSRF)', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/api/auth/setup')
      .set('Origin', 'https://sitio-malicioso.example')
      .send(OWNER);

    expect(response.status).toBe(403);
  });
});

describe('POST /api/auth/login y GET /api/auth/session', () => {
  it('abre sesión con una cookie HttpOnly y SameSite=Strict', async () => {
    const { app } = buildApp();
    await request(app).post('/api/auth/setup').send(OWNER);

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ANA@correo.cr', password: OWNER.password });

    expect(response.status).toBe(200);

    const cookie = String(response.headers['set-cookie']?.[0]);

    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(JSON.stringify(response.body)).not.toContain(OWNER.password);
  });

  it('responde 401 con credenciales incorrectas y sin cookie', async () => {
    const { app } = buildApp();
    await request(app).post('/api/auth/setup').send(OWNER);

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: OWNER.email, password: 'incorrecta123' });

    expect(response.status).toBe(401);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('GET /session responde 401 sin cookie y 200 con ella', async () => {
    const { app } = buildApp();

    expect((await request(app).get('/api/auth/session')).status).toBe(401);

    const { agent } = await loggedInAgent();

    expect((await agent.get('/api/auth/session')).body.data.email).toBe('ana@correo.cr');
  });
});

describe('POST /api/auth/logout (HU-15)', () => {
  it('responde 204, borra la cookie y la sesión deja de valer', async () => {
    const { agent } = await loggedInAgent();

    const response = await agent.post('/api/auth/logout');

    expect(response.status).toBe(204);
    expect(response.headers['cache-control']).toBe('no-store');

    const cleared = String(response.headers['set-cookie']?.[0]);

    expect(cleared).toMatch(/^ms_session=;/);
    expect(cleared).toContain('Expires=Thu, 01 Jan 1970');
    expect(cleared).toContain('HttpOnly');
    expect(cleared).toContain('SameSite=Strict');
    expect((await agent.get('/api/auth/session')).status).toBe(401);
    expect((await agent.get('/api/profile')).status).toBe(401);
  });

  it('una copia de la cookie guardada antes del cierre ya no sirve', async () => {
    const { app } = buildApp();
    await request(app).post('/api/auth/setup').send(OWNER);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: OWNER.email, password: OWNER.password });
    const copied = String(String(login.headers['set-cookie']?.[0]).split(';')[0]);

    await request(app).post('/api/auth/logout').set('Cookie', copied).expect(204);

    expect((await request(app).get('/api/auth/session').set('Cookie', copied)).status).toBe(401);
    expect((await request(app).get('/api/profile').set('Cookie', copied)).status).toBe(401);
  });

  it('se puede volver a iniciar sesión después de cerrarla', async () => {
    const { agent } = await loggedInAgent();
    await agent.post('/api/auth/logout').expect(204);

    await agent
      .post('/api/auth/login')
      .send({ email: OWNER.email, password: OWNER.password })
      .expect(200);

    expect((await agent.get('/api/auth/session')).status).toBe(200);
  });

  it('sin sesión responde 204 igual y no invalida otras sesiones', async () => {
    const { agent, app, repository } = await loggedInAgent();

    await request(app).post('/api/auth/logout').expect(204);
    await request(app)
      .post('/api/auth/logout')
      .set('Cookie', 'ms_session=eyJ1aWQiOiJ4In0.firma-falsa')
      .expect(204);

    expect(repository.stored[0]?.sessionVersion).toBe(0);
    expect((await agent.get('/api/auth/session')).status).toBe(200);
  });

  it('rechaza con 403 un cierre de sesión pedido desde otro origen (CSRF)', async () => {
    const { agent } = await loggedInAgent();

    const response = await agent
      .post('/api/auth/logout')
      .set('Origin', 'https://sitio-malicioso.example');

    expect(response.status).toBe(403);
    expect((await agent.get('/api/auth/session')).status).toBe(200);
  });
});

describe('/api/profile', () => {
  it('un usuario no autenticado no puede ver ni cambiar el perfil', async () => {
    const { app, repository } = buildApp();
    await request(app).post('/api/auth/setup').send(OWNER);

    const read = await request(app).get('/api/profile');
    const write = await request(app)
      .patch('/api/profile')
      .send({ email: 'robado@correo.cr', currentPassword: OWNER.password });

    expect(read.status).toBe(401);
    expect(write.status).toBe(401);
    expect(repository.stored[0]?.email).toBe('ana@correo.cr');
  });

  it('un token falso no sirve', async () => {
    const { app } = buildApp();
    await request(app).post('/api/auth/setup').send(OWNER);

    const response = await request(app)
      .get('/api/profile')
      .set('Cookie', 'ms_session=eyJ1aWQiOiJ4In0.firma-falsa');

    expect(response.status).toBe(401);
  });

  it('GET devuelve los datos actuales sin contraseña', async () => {
    const { agent } = await loggedInAgent();

    const response = await agent.get('/api/profile');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.objectContaining({ name: 'Ana Pérez', email: 'ana@correo.cr' }),
    );
    expect(JSON.stringify(response.body)).not.toMatch(/password|argon2/i);
  });

  it('PATCH actualiza el nombre', async () => {
    const { agent } = await loggedInAgent();

    const response = await agent.patch('/api/profile').send({ name: 'Ana María' });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe('Ana María');
  });

  it('PATCH rechaza un correo inválido con 400', async () => {
    const { agent } = await loggedInAgent();

    const response = await agent
      .patch('/api/profile')
      .send({ email: 'sin-formato', currentPassword: OWNER.password });

    expect(response.status).toBe(400);
  });

  it('PATCH cambia el correo solo con la contraseña actual', async () => {
    const { agent } = await loggedInAgent();

    const denied = await agent.patch('/api/profile').send({ email: 'nuevo@correo.cr' });
    const ok = await agent
      .patch('/api/profile')
      .send({ email: 'nuevo@correo.cr', currentPassword: OWNER.password });

    expect(denied.status).toBe(403);
    expect(ok.status).toBe(200);
    expect(ok.body.data.email).toBe('nuevo@correo.cr');
  });

  it('cambiar la contraseña conserva la sesión actual e invalida las anteriores', async () => {
    const { agent, app } = await loggedInAgent();
    const oldCookie = String(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ email: OWNER.email, password: OWNER.password })
      ).headers['set-cookie']?.[0],
    ).split(';')[0];

    const changed = await agent
      .patch('/api/profile')
      .send({ newPassword: 'NuevaClave789012', currentPassword: OWNER.password });

    expect(changed.status).toBe(200);
    expect((await agent.get('/api/profile')).status).toBe(200);
    expect((await request(app).get('/api/profile').set('Cookie', String(oldCookie))).status).toBe(
      401,
    );
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ email: OWNER.email, password: 'NuevaClave789012' })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ email: OWNER.email, password: OWNER.password })
      ).status,
    ).toBe(401);
  });

  it('PATCH desde otro origen se rechaza con 403 aunque traiga la cookie', async () => {
    const { agent } = await loggedInAgent();

    const response = await agent
      .patch('/api/profile')
      .set('Origin', 'https://sitio-malicioso.example')
      .send({ name: 'Hackeado' });

    expect(response.status).toBe(403);
  });
});
