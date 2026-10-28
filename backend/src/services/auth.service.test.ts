import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_BUSINESS_ID } from '../testing/fake-session.js';
import { FakeUsersRepository, makeUser } from '../testing/users.repository.fake.js';
import { LoginRateLimiter } from '../utils/login-rate-limiter.js';
import { hashPassword } from '../utils/password.js';
import { AuthService, type AuthServiceOptions } from './auth.service.js';

/** Inicio y cierre de sesión (HU-11, HU-15) con roles, con el doble de repositorio. */

const SETUP = { name: 'Ana Pérez', email: 'ana@correo.cr', password: 'ClaveSegura123' };

let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(SETUP.password);
});

function setup(options: Partial<AuthServiceOptions> = {}, user = makeUser({ passwordHash })) {
  const repository = new FakeUsersRepository([user]);
  const service = new AuthService(repository, {
    sessionSecret: 's'.repeat(40),
    limiter: new LoginRateLimiter(),
    ...options,
  });

  return { repository, service };
}

describe('AuthService.login y resolveSession', () => {
  it('con credenciales correctas emite una sesión que resuelve al usuario con su rol y permisos', async () => {
    const { service } = setup();

    const session = await service.login({ email: SETUP.email, password: SETUP.password }, 'ip-1');

    expect(session.user).toEqual(
      expect.objectContaining({ email: 'ana@correo.cr', role: 'ADMIN', mustChangePassword: false }),
    );
    expect(session.user.permissions).toContain('platform.manage');
    expect(session.user).not.toHaveProperty('passwordHash');
    expect(await service.resolveSession(session.token)).toEqual(session.user);
  });

  it('un Cajero recibe solo los permisos de su rol', async () => {
    const { service } = setup({}, makeUser({ passwordHash, role: 'CAJERO' }));

    const session = await service.login({ email: SETUP.email, password: SETUP.password }, 'ip-1');

    expect(session.user.permissions).toEqual(['sales', 'customers', 'inventory.read']);
    expect(session.user.businessId).toBe(TEST_BUSINESS_ID);
  });

  it('el Administrador es de la plataforma: su sesión no tiene negocio', async () => {
    const { service } = setup();

    const session = await service.login({ email: SETUP.email, password: SETUP.password }, 'ip-1');

    expect(session.user.businessId).toBeNull();
  });

  it('con el negocio suspendido no se entra, y solo se dice si la contraseña es correcta', async () => {
    const { service } = setup(
      {},
      makeUser({ passwordHash, role: 'CAJERO', businessStatus: 'SUSPENDED' }),
    );

    await expect(
      service.login({ email: SETUP.email, password: SETUP.password }, 'ip-1'),
    ).rejects.toMatchObject({ statusCode: 403, message: expect.stringMatching(/suspendido/) });
    await expect(
      service.login({ email: SETUP.email, password: 'incorrecta123' }, 'ip-2'),
    ).rejects.toMatchObject({ statusCode: 401, message: 'Correo o contraseña incorrectos.' });
  });

  it('al suspender el negocio, las sesiones abiertas de su gente dejan de valer', async () => {
    const user = makeUser({ passwordHash, role: 'CAJERO' });
    const { service } = setup({}, user);
    const session = await service.login({ email: SETUP.email, password: SETUP.password }, 'ip-1');

    user.businessStatus = 'SUSPENDED';

    expect(await service.resolveSession(session.token)).toBeNull();
  });

  it('un usuario desactivado no inicia sesión y recibe el mismo mensaje que con datos incorrectos', async () => {
    const { service } = setup({}, makeUser({ passwordHash, isActive: false }));

    const inactive = await service
      .login({ email: SETUP.email, password: SETUP.password }, 'ip-1')
      .catch((error: unknown) => error);
    const wrong = await service
      .login({ email: SETUP.email, password: 'incorrecta123' }, 'ip-2')
      .catch((error: unknown) => error);

    expect(inactive).toMatchObject({ statusCode: 401, message: (wrong as Error).message });
  });

  it('al desactivar al usuario, su sesión abierta deja de valer', async () => {
    const { repository, service } = setup();
    const session = await service.login({ email: SETUP.email, password: SETUP.password }, 'ip-1');

    await repository.update(session.user.id, { isActive: false });

    expect(await service.resolveSession(session.token)).toBeNull();
  });

  it('con una contraseña temporal la sesión lo indica', async () => {
    const { service } = setup({}, makeUser({ passwordHash, mustChangePassword: true }));

    const session = await service.login({ email: SETUP.email, password: SETUP.password }, 'ip-1');

    expect(session.user.mustChangePassword).toBe(true);
  });

  it('responde 401 con el mismo mensaje si falla la contraseña o el correo no existe', async () => {
    const { service } = setup();

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

  it('invalida también las demás sesiones abiertas del usuario', async () => {
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
