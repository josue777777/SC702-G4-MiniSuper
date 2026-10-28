import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { errorHandler } from '../middleware/error-handler.middleware.js';
import { AuthService } from '../services/auth.service.js';
import { FakePreferencesRepository } from '../testing/preferences.repository.fake.js';
import { FakeUsersRepository, makeUser } from '../testing/users.repository.fake.js';
import { LoginRateLimiter } from '../utils/login-rate-limiter.js';
import { hashPassword } from '../utils/password.js';
import { createAuthRouter } from './auth.routes.js';
import { createProfileRouter } from './profile.routes.js';

/** Configuración › Apariencia: cada usuario, la suya (cualquier rol). */

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'ClaveSegura123';
const CAJERO_ID = '22222222-2222-4222-8222-222222222222';

let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

function buildApp() {
  const users = new FakeUsersRepository([
    makeUser({ passwordHash }),
    makeUser({ id: CAJERO_ID, email: 'caja@correo.cr', role: 'CAJERO', passwordHash }),
  ]);
  const preferences = new FakePreferencesRepository();
  const auth = new AuthService(users, {
    sessionSecret: 's'.repeat(40),
    limiter: new LoginRateLimiter(),
  });
  const app = express();

  app.use(express.json());
  app.use('/api/auth', createAuthRouter(auth, ORIGIN, false));
  app.use('/api/profile', createProfileRouter(users, auth, ORIGIN, false, preferences));
  app.use(errorHandler);

  return { app, preferences };
}

async function loginAs(email: string, built = buildApp()) {
  const agent = request.agent(built.app);

  await agent.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);

  return { agent, ...built };
}

describe('apariencia por usuario', () => {
  it('sin elegir nada, tiene la apariencia de fábrica', async () => {
    const { agent } = await loginAs('caja@correo.cr');

    expect((await agent.get('/api/profile/preferences')).body.data).toEqual({
      accentColor: 'AZUL',
      fontScale: 'NORMAL',
    });
  });

  it('un Cajero cambia la suya y no afecta a los demás', async () => {
    const built = buildApp();
    const cajero = await loginAs('caja@correo.cr', built);
    const admin = await loginAs('ana@correo.cr', built);

    const saved = await cajero.agent
      .put('/api/profile/preferences')
      .send({ accentColor: 'VERDE', fontScale: 'GRANDE' });

    expect(saved.status).toBe(200);
    expect(built.preferences.saved.get(CAJERO_ID)).toEqual({
      accentColor: 'VERDE',
      fontScale: 'GRANDE',
    });
    expect((await admin.agent.get('/api/profile/preferences')).body.data.accentColor).toBe('AZUL');
  });

  it('solo acepta opciones de la lista', async () => {
    const { agent } = await loginAs('caja@correo.cr');

    const response = await agent
      .put('/api/profile/preferences')
      .send({ accentColor: '#ff00ff', fontScale: 'ENORME' });

    expect(response.status).toBe(400);
    expect(Object.keys(response.body.error.details)).toEqual(['accentColor', 'fontScale']);
  });

  it('sin sesión responde 401', async () => {
    const { app } = buildApp();

    expect((await request(app).get('/api/profile/preferences')).status).toBe(401);
  });
});
