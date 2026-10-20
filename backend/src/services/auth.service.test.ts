import { describe, expect, it } from 'vitest';
import { FakeUsersRepository } from '../testing/users.repository.fake.js';
import { LoginRateLimiter } from '../utils/login-rate-limiter.js';
import { AuthService, type AuthServiceOptions } from './auth.service.js';

/** Cuenta única (HU-12) y sesión mínima, con el doble de repositorio. */

const SETUP = { name: 'Ana Pérez', email: 'ana@correo.cr', password: 'ClaveSegura123' };

function setup(options: Partial<AuthServiceOptions> = {}) {
  const repository = new FakeUsersRepository();
  const service = new AuthService(repository, {
    sessionSecret: 's'.repeat(40),
    requireSetupToken: false,
    limiter: new LoginRateLimiter(),
    ...options,
  });

  return { repository, service };
}

describe('AuthService.setupOwner', () => {
  it('crea la cuenta y guarda un hash Argon2id, nunca la contraseña', async () => {
    const { repository, service } = setup();

    const created = await service.setupOwner(SETUP);

    expect(created).toEqual(expect.objectContaining({ name: 'Ana Pérez', email: 'ana@correo.cr' }));
    expect(created).not.toHaveProperty('passwordHash');

    const stored = repository.stored[0];

    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored?.passwordHash).not.toContain(SETUP.password);
  });

  it('responde 409 al segundo intento: solo existe una cuenta', async () => {
    const { repository, service } = setup();
    await service.setupOwner(SETUP);

    await expect(service.setupOwner({ ...SETUP, email: 'otra@correo.cr' })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(repository.stored).toHaveLength(1);
  });

  it('responde 409 si otra petición simultánea creó la cuenta primero', async () => {
    const { repository, service } = setup();
    repository.simulateRaceOnCreate = true;

    await expect(service.setupOwner(SETUP)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('exige el token de configuración cuando el administrador lo definió', async () => {
    const { repository, service } = setup({ setupToken: 'token-de-instalacion-1' });

    await expect(service.setupOwner(SETUP)).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.setupOwner({ ...SETUP, setupToken: 'token-equivocado-0000' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.stored).toHaveLength(0);

    await service.setupOwner({ ...SETUP, setupToken: 'token-de-instalacion-1' });

    expect(repository.stored).toHaveLength(1);
  });

  it('en producción deshabilita la configuración si no hay token definido', async () => {
    const { repository, service } = setup({ requireSetupToken: true });

    await expect(service.setupOwner(SETUP)).rejects.toMatchObject({ statusCode: 503 });
    expect(repository.stored).toHaveLength(0);
  });
});

describe('AuthService.getSetupStatus', () => {
  it('informa si ya hay cuenta y si se pide token', async () => {
    const { service } = setup({ setupToken: 'token-de-instalacion-1' });

    expect(await service.getSetupStatus()).toEqual({ configured: false, tokenRequired: true });

    await service.setupOwner({ ...SETUP, setupToken: 'token-de-instalacion-1' });

    expect(await service.getSetupStatus()).toEqual({ configured: true, tokenRequired: true });
  });
});

describe('AuthService.login y resolveSession', () => {
  it('con credenciales correctas emite una sesión que resuelve al dueño', async () => {
    const { service } = setup();
    await service.setupOwner(SETUP);

    const session = await service.login({ email: SETUP.email, password: SETUP.password }, 'ip-1');

    expect(session.user.email).toBe('ana@correo.cr');
    expect(await service.resolveSession(session.token)).toEqual(session.user);
  });

  it('responde 401 con el mismo mensaje si falla la contraseña o el correo no existe', async () => {
    const { service } = setup();
    await service.setupOwner(SETUP);

    const wrongPassword = await service
      .login({ email: SETUP.email, password: 'incorrecta123' }, 'ip-1')
      .catch((error: unknown) => error);
    const unknownEmail = await service
      .login({ email: 'nadie@correo.cr', password: SETUP.password }, 'ip-1')
      .catch((error: unknown) => error);

    expect(wrongPassword).toMatchObject({ statusCode: 401 });
    expect(unknownEmail).toMatchObject({
      statusCode: 401,
      message: (wrongPassword as Error).message,
    });
  });

  it('bloquea con 429 tras demasiados intentos fallidos', async () => {
    const { service } = setup({ limiter: new LoginRateLimiter(2) });
    await service.setupOwner(SETUP);
    const bad = { email: SETUP.email, password: 'incorrecta123' };

    await expect(service.login(bad, 'ip-1')).rejects.toMatchObject({ statusCode: 401 });
    await expect(service.login(bad, 'ip-1')).rejects.toMatchObject({ statusCode: 401 });
    await expect(
      service.login({ email: SETUP.email, password: SETUP.password }, 'ip-1'),
    ).rejects.toMatchObject({ statusCode: 429 });
  });

  it('no acepta tokens inexistentes, falsos o vencidos', async () => {
    let now = new Date('2026-10-18T10:00:00Z');
    const { service } = setup({ now: () => now });
    await service.setupOwner(SETUP);
    const session = await service.login({ email: SETUP.email, password: SETUP.password }, 'ip-1');

    expect(await service.resolveSession(undefined)).toBeNull();
    expect(await service.resolveSession('token.falso')).toBeNull();

    now = new Date('2026-10-18T19:00:00Z');

    expect(await service.resolveSession(session.token)).toBeNull();
  });
});

describe('AuthService.logout (HU-15)', () => {
  async function loggedIn() {
    const context = setup();
    await context.service.setupOwner(SETUP);
    const session = await context.service.login(
      { email: SETUP.email, password: SETUP.password },
      'ip-1',
    );

    return { ...context, session };
  }

  it('invalida el token de la sesión cerrada', async () => {
    const { service, session } = await loggedIn();

    await service.logout(session.token);

    expect(await service.resolveSession(session.token)).toBeNull();
  });

  it('invalida también las demás sesiones abiertas del dueño', async () => {
    const { service, session } = await loggedIn();
    const other = await service.login({ email: SETUP.email, password: SETUP.password }, 'ip-2');

    await service.logout(session.token);

    expect(await service.resolveSession(other.token)).toBeNull();
  });

  it('una sesión nueva tras el cierre vuelve a funcionar', async () => {
    const { service, session } = await loggedIn();
    await service.logout(session.token);

    const next = await service.login({ email: SETUP.email, password: SETUP.password }, 'ip-1');

    expect(await service.resolveSession(next.token)).toEqual(next.user);
  });

  it('sin token válido no hace nada (cerrar dos veces no es un error)', async () => {
    const { repository, service, session } = await loggedIn();

    await service.logout(undefined);
    await service.logout('token.falso');

    expect(repository.stored[0]?.sessionVersion).toBe(0);
    expect(await service.resolveSession(session.token)).toEqual(session.user);

    await service.logout(session.token);
    await service.logout(session.token);

    expect(repository.stored[0]?.sessionVersion).toBe(1);
  });
});
