import { describe, expect, it } from 'vitest';
import type { UserActor, UserRecord } from '../types/auth.js';
import { FakeUsersRepository, makeUser, OWNER_ID } from '../testing/users.repository.fake.js';
import { verifyPassword } from '../utils/password.js';
import { TEMPORARY_PASSWORD_LENGTH } from '../utils/temporary-password.js';
import { UsersService } from './users.service.js';

/** Configuración › Usuarios con jerarquía y límite del plan (criterios de HU-11 a HU-15). */

const ENCARGADO_ID = '22222222-2222-4222-8222-222222222222';
const CAJERO_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_ADMIN_ID = '44444444-4444-4444-8444-444444444444';

const ADMIN: UserActor = { id: OWNER_ID, role: 'ADMIN' };
const ENCARGADO: UserActor = { id: ENCARGADO_ID, role: 'ENCARGADO' };

const encargado = makeUser({
  id: ENCARGADO_ID,
  name: 'Elena',
  email: 'elena@correo.cr',
  role: 'ENCARGADO',
});
const cajero = makeUser({ id: CAJERO_ID, name: 'Carlos', email: 'caja@correo.cr', role: 'CAJERO' });

function setup(users: UserRecord[] = [encargado, cajero], maxUsers = 5) {
  const repository = new FakeUsersRepository([makeUser(), ...users], { maxUsers });

  return { repository, service: new UsersService(repository) };
}

const stored = (repository: FakeUsersRepository, id: string) =>
  repository.stored.find((user) => user.id === id);

const NEW_USER = { name: 'Bea', email: 'bea@correo.cr', role: 'BODEGA' } as const;

describe('UsersService.create', () => {
  it('crea el usuario con una contraseña temporal que debe cambiar', async () => {
    const { repository, service } = setup();

    const result = await service.create(NEW_USER, ADMIN);

    expect(result.temporaryPassword).toHaveLength(TEMPORARY_PASSWORD_LENGTH);
    expect(result.user).toEqual(
      expect.objectContaining({ role: 'BODEGA', isActive: true, mustChangePassword: true }),
    );
    expect(result.user).not.toHaveProperty('passwordHash');

    const saved = stored(repository, result.user.id);

    expect(await verifyPassword(saved?.passwordHash ?? '', result.temporaryPassword)).toBe(true);
  });

  it('rechaza un correo que ya está en uso (409)', async () => {
    const { service } = setup();

    await expect(
      service.create({ ...NEW_USER, email: 'caja@correo.cr' }, ADMIN),
    ).rejects.toMatchObject({ statusCode: 409, message: 'Ese correo ya está en uso.' });
  });

  it('el Encargado crea Cajeros y Bodegas', async () => {
    const { service } = setup();

    expect((await service.create(NEW_USER, ENCARGADO)).user.role).toBe('BODEGA');
  });

  it.each(['ENCARGADO', 'ADMIN'] as const)(
    'el Encargado no puede crear un usuario %s (403)',
    async (role) => {
      const { repository, service } = setup();

      await expect(service.create({ ...NEW_USER, role }, ENCARGADO)).rejects.toMatchObject({
        statusCode: 403,
        message: 'Solo puede administrar usuarios de un rango menor al suyo.',
      });
      expect(repository.stored).toHaveLength(3);
    },
  );
});

describe('límite de usuarios del plan', () => {
  it('con el plan lleno no deja crear más usuarios y explica qué hacer', async () => {
    // Plan de 2: el Encargado y el Cajero ya los ocupan (el Administrador no cuenta).
    const { repository, service } = setup(undefined, 2);

    await expect(service.create(NEW_USER, ENCARGADO)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/El plan permite 2 usuarios activos/),
    });
    expect(repository.stored).toHaveLength(3);
  });

  it('los administradores de la plataforma no ocupan cupo', async () => {
    const { service } = setup(undefined, 2);

    const created = await service.create({ ...NEW_USER, role: 'ADMIN' }, ADMIN);

    expect(created.user.role).toBe('ADMIN');
  });

  it('los usuarios desactivados no ocupan cupo', async () => {
    const { service } = setup([encargado, { ...cajero, isActive: false }], 2);

    expect((await service.create(NEW_USER, ENCARGADO)).user.isActive).toBe(true);
  });

  it('reactivar a alguien exige que haya cupo', async () => {
    const { service } = setup([encargado, { ...cajero, isActive: false }], 1);

    await expect(service.activate(CAJERO_ID, ENCARGADO)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/El plan permite 1 usuario activo /),
    });
  });

  it('quitarle el rol de administrador a alguien exige cupo, porque pasa a ocupar uno', async () => {
    const { service } = setup(
      [encargado, cajero, makeUser({ id: OTHER_ADMIN_ID, email: 'luis@correo.cr' })],
      2,
    );

    await expect(
      service.update(OTHER_ADMIN_ID, { role: 'ENCARGADO' }, ADMIN),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('UsersService.list', () => {
  it('el Administrador ve a todos', async () => {
    const { service } = setup();

    expect((await service.list(ADMIN)).map((user) => user.role).sort()).toEqual([
      'ADMIN',
      'CAJERO',
      'ENCARGADO',
    ]);
  });

  it('el Encargado ve a los usuarios que administra y a sí mismo, no al Administrador', async () => {
    const { service } = setup();

    expect((await service.list(ENCARGADO)).map((user) => user.id).sort()).toEqual(
      [ENCARGADO_ID, CAJERO_ID].sort(),
    );
  });
});

describe('UsersService.update', () => {
  it('cambiar el rol cierra las sesiones de ese usuario', async () => {
    const { repository, service } = setup();

    const updated = await service.update(CAJERO_ID, { role: 'BODEGA' }, ENCARGADO);

    expect(updated.role).toBe('BODEGA');
    expect(stored(repository, CAJERO_ID)?.sessionVersion).toBe(1);
  });

  it('cambiar solo el nombre no cierra sus sesiones', async () => {
    const { repository, service } = setup();

    await service.update(CAJERO_ID, { name: 'Carlos Mora' }, ADMIN);

    expect(stored(repository, CAJERO_ID)?.sessionVersion).toBe(0);
  });

  it('el Encargado no puede ascender a nadie a Encargado (403)', async () => {
    const { service } = setup();

    await expect(service.update(CAJERO_ID, { role: 'ENCARGADO' }, ENCARGADO)).rejects.toMatchObject(
      { statusCode: 403 },
    );
  });

  it('el Encargado no puede editar al Administrador (403)', async () => {
    const { service } = setup();

    await expect(service.update(OWNER_ID, { name: 'Otro' }, ENCARGADO)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('cada uno puede corregir su propio nombre, pero no su rol', async () => {
    const { service } = setup();

    expect((await service.update(ENCARGADO_ID, { name: 'Elena R.' }, ENCARGADO)).name).toBe(
      'Elena R.',
    );
    await expect(service.update(OWNER_ID, { role: 'CAJERO' }, ADMIN)).rejects.toMatchObject({
      statusCode: 409,
      message: 'No puede cambiar su propio rol.',
    });
  });

  it('no deja al sistema sin un administrador activo', async () => {
    // Un administrador inactivo no cuenta: Ana es la única activa.
    const { service } = setup([
      makeUser({ id: OTHER_ADMIN_ID, email: 'luis@correo.cr', isActive: false }),
    ]);

    await expect(
      service.update(OWNER_ID, { role: 'CAJERO' }, { id: OTHER_ADMIN_ID, role: 'ADMIN' }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'El sistema debe tener al menos un administrador activo.',
    });
  });

  it('rechaza el correo de otro usuario y avisa si no hay cambios', async () => {
    const { service } = setup();

    await expect(
      service.update(CAJERO_ID, { email: 'ana@correo.cr' }, ADMIN),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.update(CAJERO_ID, { name: 'Carlos' }, ADMIN)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('responde 404 si el usuario no existe', async () => {
    const { service } = setup();

    await expect(service.update(OTHER_ADMIN_ID, { name: 'Nadie' }, ADMIN)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('UsersService.deactivate / activate', () => {
  it('desactivar no borra al usuario y cierra sus sesiones', async () => {
    const { repository, service } = setup();

    expect((await service.deactivate(CAJERO_ID, ENCARGADO)).isActive).toBe(false);
    expect(stored(repository, CAJERO_ID)).toEqual(
      expect.objectContaining({ isActive: false, sessionVersion: 1 }),
    );
    expect((await service.activate(CAJERO_ID, ENCARGADO)).isActive).toBe(true);
  });

  it('nadie puede desactivar su propia cuenta', async () => {
    const { service } = setup();

    await expect(service.deactivate(OWNER_ID, ADMIN)).rejects.toMatchObject({
      statusCode: 409,
      message: 'No puede desactivar su propia cuenta.',
    });
  });

  it('el Encargado no puede desactivar al Administrador ni a otro Encargado (403)', async () => {
    const { repository, service } = setup([
      encargado,
      makeUser({ id: OTHER_ADMIN_ID, email: 'otro@correo.cr', role: 'ENCARGADO' }),
    ]);

    await expect(service.deactivate(OWNER_ID, ENCARGADO)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(service.deactivate(OTHER_ADMIN_ID, ENCARGADO)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(stored(repository, OWNER_ID)?.isActive).toBe(true);
  });

  it('no se puede desactivar al último administrador activo', async () => {
    const { repository, service } = setup([
      makeUser({ id: OTHER_ADMIN_ID, email: 'luis@correo.cr', isActive: false }),
    ]);

    await expect(
      service.deactivate(OWNER_ID, { id: OTHER_ADMIN_ID, role: 'ADMIN' }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(stored(repository, OWNER_ID)?.isActive).toBe(true);
  });
});

describe('UsersService.resetPassword (HU-13)', () => {
  it('genera una contraseña temporal nueva, obliga a cambiarla y cierra sus sesiones', async () => {
    const { repository, service } = setup();
    const before = stored(repository, CAJERO_ID)?.passwordHash;

    const result = await service.resetPassword(CAJERO_ID, ENCARGADO);
    const saved = stored(repository, CAJERO_ID);

    expect(saved?.passwordHash).not.toBe(before);
    expect(await verifyPassword(saved?.passwordHash ?? '', result.temporaryPassword)).toBe(true);
    expect(saved).toEqual(expect.objectContaining({ mustChangePassword: true, sessionVersion: 1 }));
  });

  it('el Encargado no puede restablecer la contraseña del Administrador (403)', async () => {
    const { service } = setup();

    await expect(service.resetPassword(OWNER_ID, ENCARGADO)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('la propia contraseña se cambia en «Mi perfil»', async () => {
    const { service } = setup();

    await expect(service.resetPassword(OWNER_ID, ADMIN)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
