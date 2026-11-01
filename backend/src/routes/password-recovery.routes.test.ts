import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../middleware/error-handler.middleware.js';
import { AccountNotifier } from '../services/account-notifier.service.js';
import { PasswordRecoveryService } from '../services/password-recovery.service.js';
import { TEST_BUSINESS_ID } from '../testing/fake-session.js';
import { FakeMailer } from '../testing/mailer.fake.js';
import { FakePasswordResetRepository } from '../testing/password-reset.repository.fake.js';
import { LoginRateLimiter } from '../utils/login-rate-limiter.js';
import { createPasswordRecoveryRouter } from './password-recovery.routes.js';

/** HTTP de la recuperación de contraseña por correo (HU-13), sin base de datos. */

const ORIGIN = 'http://localhost:5173';

function buildApp() {
  const repository = new FakePasswordResetRepository([
    {
      id: '10000000-0000-4000-8000-000000000001',
      name: 'Elena',
      email: 'elena@correo.cr',
      role: 'ENCARGADO',
      businessId: TEST_BUSINESS_ID,
      isActive: true,
      businessStatus: 'ACTIVE',
    },
  ]);
  const mailer = new FakeMailer();
  const service = new PasswordRecoveryService(repository, new AccountNotifier(mailer), {
    appUrl: ORIGIN,
    emailLimiter: new LoginRateLimiter(3, 60_000),
    ipLimiter: new LoginRateLimiter(10, 60_000),
  });
  const app = express();

  app.use(express.json());
  app.use('/api/auth/password', createPasswordRecoveryRouter(service, ORIGIN));
  app.use(errorHandler);

  return { app, mailer };
}

describe('POST /api/auth/password/forgot', () => {
  it('responde 202 igual con un correo registrado que con uno que no existe', async () => {
    const { app, mailer } = buildApp();

    const known = await request(app)
      .post('/api/auth/password/forgot')
      .set('Origin', ORIGIN)
      .send({ email: 'Elena@Correo.cr' });
    const unknown = await request(app)
      .post('/api/auth/password/forgot')
      .set('Origin', ORIGIN)
      .send({ email: 'nadie@correo.cr' });

    expect([known.status, unknown.status]).toEqual([202, 202]);
    expect(known.body).toEqual(unknown.body);
    expect(known.headers['cache-control']).toBe('no-store');
    // El correo se compara en minúsculas, como el login.
    expect(mailer.sent).toHaveLength(1);
  });

  it('un correo con formato inválido responde 400', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/api/auth/password/forgot')
      .set('Origin', ORIGIN)
      .send({ email: 'no-es-correo' });

    expect(response.status).toBe(400);
  });

  it('rechaza peticiones de otro origen (CSRF)', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/api/auth/password/forgot')
      .set('Origin', 'https://otro-sitio.com')
      .send({ email: 'elena@correo.cr' });

    expect(response.status).toBe(403);
  });
});

describe('POST /api/auth/password/reset', () => {
  it('con el enlace del correo cambia la contraseña (204); repetirlo responde 400', async () => {
    const { app, mailer } = buildApp();

    await request(app)
      .post('/api/auth/password/forgot')
      .set('Origin', ORIGIN)
      .send({ email: 'elena@correo.cr' });

    const token = new URL(mailer.lastLinkTo('elena@correo.cr') ?? '').searchParams.get('token');
    const send = () =>
      request(app)
        .post('/api/auth/password/reset')
        .set('Origin', ORIGIN)
        .send({ token, password: 'ClaveNueva2026' });

    expect((await send()).status).toBe(204);

    const again = await send();

    expect(again.status).toBe(400);
    expect(again.body.error.message).toBe(
      'El enlace no es válido o ya venció. Solicite uno nuevo.',
    );
  });

  it('exige la misma política de contraseña que el resto del sistema', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/api/auth/password/reset')
      .set('Origin', ORIGIN)
      .send({ token: 'a'.repeat(43), password: 'corta' });

    expect(response.status).toBe(400);
  });
});
