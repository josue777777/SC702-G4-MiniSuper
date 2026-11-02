import { beforeAll, describe, expect, it } from 'vitest';
import type { UserActor } from '../types/auth.js';
import { TEST_BUSINESS_ID } from '../testing/fake-session.js';
import { FakeUsersRepository, makeUser, OWNER_ID } from '../testing/users.repository.fake.js';
import { LoginRateLimiter } from '../utils/login-rate-limiter.js';
import { hashPassword } from '../utils/password.js';
import { AuthService } from './auth.service.js';
import { ProfileService } from './profile.service.js';
import { UsersService } from './users.service.js';

/**
 * Nombre de usuario y correo opcional (HU-11, HU-12): el personal entra con su
 * usuario; el correo solo es obligatorio para quien recupera por correo.
 */

const ENCARGADO_ID = '22222222-2222-4222-8222-222222222222';
const ENCARGADO: UserActor = { id: ENCARGADO_ID, role: 'ENCARGADO', businessId: TEST_BUSINESS_ID };
const PASSWORD = 'ClaveSegura123';

let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

function setup() {
  const repository = new FakeUsersRepository([
    makeUser(),
    makeUser({
      id: ENCARGADO_ID,
      name: 'Elena Encargada',
      username: 'eencargada',
      email: 'elena@correo.cr',
      role: 'ENCARGADO',
      passwordHash,
    }),
  ]);

  return {
    repository,
    users: new UsersService(repository),
    auth: new AuthService(repository, {
      sessionSecret: 's'.repeat(40),
      limiter: new LoginRateLimiter(),
    }),
    profile: new ProfileService(repository),
  };
}

describe('alta de usuarios con nombre de usuario', () => {
  it('un Cajero se crea sin correo y recibe un usuario generado de su nombre', async () => {
    const { users } = setup();

    const { user } = await users.create({ name: 'Juan Navarro', role: 'CAJERO' }, ENCARGADO);

    expect(user).toMatchObject({ username: 'jnavarro', email: null, role: 'CAJERO' });
  });

  it('si el usuario ya existe (en cualquier negocio), se le agrega un número', async () => {
    const { users } = setup();

    await users.create({ name: 'Juan Navarro', role: 'CAJERO' }, ENCARGADO);
    const second = await users.create({ name: 'Julia Navarro', role: 'BODEGA' }, ENCARGADO);

    expect(second.user.username).toBe('jnavarro2');
    expect(await users.suggestUsername('José Navarro')).toBe('jnavarro3');
  });

  it('se puede elegir otro usuario, si está libre', async () => {
    const { users } = setup();

    const { user } = await users.create(
      { name: 'Juan Navarro', username: 'juan.n', role: 'CAJERO' },
      ENCARGADO,
    );

    expect(user.username).toBe('juan.n');
    await expect(
      users.create({ name: 'Otro Juan', username: 'juan.n', role: 'CAJERO' }, ENCARGADO),
    ).rejects.toMatchObject({ statusCode: 409, message: 'Ese usuario ya existe. Elija otro.' });
  });

  it('un Encargado sin correo no se puede crear: lo necesita para recuperar su contraseña', async () => {
    const { users } = setup();

    await expect(
      users.create(
        { name: 'Mario Mora', role: 'ENCARGADO', businessId: TEST_BUSINESS_ID },
        {
          id: OWNER_ID,
          role: 'ADMIN',
          businessId: null,
        },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('al Cajero se le puede quitar el correo; al Encargado no', async () => {
    const { users } = setup();
    const { user } = await users.create(
      { name: 'Juan Navarro', email: 'juan@correo.cr', role: 'CAJERO' },
      ENCARGADO,
    );

    expect((await users.update(user.id, { email: null }, ENCARGADO)).email).toBeNull();
    await expect(
      users.update(
        ENCARGADO_ID,
        { email: null },
        { id: OWNER_ID, role: 'ADMIN', businessId: null },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('cambiar el usuario a uno tomado responde 409', async () => {
    const { users } = setup();
    const { user } = await users.create({ name: 'Juan Navarro', role: 'CAJERO' }, ENCARGADO);

    await expect(
      users.update(user.id, { username: 'eencargada' }, ENCARGADO),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect((await users.update(user.id, { username: 'juancho' }, ENCARGADO)).username).toBe(
      'juancho',
    );
  });
});

describe('login con correo o con usuario', () => {
  it('se entra con el correo o con el usuario; ambos sin importar mayúsculas', async () => {
    const { auth } = setup();

    expect((await auth.login({ login: 'elena@correo.cr', password: PASSWORD }, 'ip')).user.id).toBe(
      ENCARGADO_ID,
    );
    expect(
      (await auth.login({ login: 'eencargada', password: PASSWORD }, 'ip')).user,
    ).toMatchObject({ id: ENCARGADO_ID, username: 'eencargada' });
  });

  it('un usuario inexistente da el mismo mensaje que una contraseña incorrecta', async () => {
    const { auth } = setup();

    await expect(auth.login({ login: 'nadie', password: PASSWORD }, 'ip')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Usuario o contraseña incorrectos.',
    });
  });
});

describe('perfil: correo opcional según el rol', () => {
  it('quien recupera por correo no puede quitarse el correo', async () => {
    const { profile } = setup();

    await expect(
      profile.updateProfile(ENCARGADO_ID, { email: null, currentPassword: PASSWORD }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
