import { describe, expect, it } from 'vitest';
import { FakeUsersRepository, makeUser, OWNER_ID } from '../testing/users.repository.fake.js';
import { verifyPassword } from '../utils/password.js';
import { TEMPORARY_PASSWORD_LENGTH } from '../utils/temporary-password.js';
import { UsersService } from './users.service.js';

/** Configuración › Usuarios (HU-12 a HU-15, criterios de usuarios y roles). */

const CAJERO_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ADMIN_ID = '33333333-3333-4333-8333-333333333333';

function setup(
  extra = [makeUser({ id: CAJERO_ID, name: 'Carlos', email: 'caja@correo.cr', role: 'CAJERO' })],
) {
  const repository = new FakeUsersRepository([makeUser(), ...extra]);

  return { repository, service: new UsersService(repository) };
}

const stored = (repository: FakeUsersRepository, id: string) =>
  repository.stored.find((user) => user.id === id);

describe('UsersService.create', () => {
  it('crea el usuario con una contraseña temporal que debe cambiar', async () => {
    const { repository, service } = setup();

    const result = await service.create({ name: 'Bea', email: 'bea@correo.cr', role: 'BODEGA' });

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
      service.create({ name: 'Otra', email: 'caja@correo.cr', role: 'CAJERO' }),
    ).rejects.toMatchObject({ statusCode: 409, message: 'Ese correo ya está en uso.' });
  });
});

describe('UsersService.update', () => {
  it('cambiar el rol cierra las sesiones de ese usuario', async () => {
    const { repository, service } = setup();

    const updated = await service.update(CAJERO_ID, { role: 'ENCARGADO' }, OWNER_ID);

    expect(updated.role).toBe('ENCARGADO');
    expect(stored(repository, CAJERO_ID)?.sessionVersion).toBe(1);
  });

  it('cambiar solo el nombre no cierra sus sesiones', async () => {
    const { repository, service } = setup();

    await service.update(CAJERO_ID, { name: 'Carlos Mora' }, OWNER_ID);

    expect(stored(repository, CAJERO_ID)?.sessionVersion).toBe(0);
  });

  it('nadie puede cambiar su propio rol', async () => {
    const { service } = setup([makeUser({ id: OTHER_ADMIN_ID, email: 'luis@correo.cr' })]);

    await expect(service.update(OWNER_ID, { role: 'CAJERO' }, OWNER_ID)).rejects.toMatchObject({
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
      service.update(OWNER_ID, { role: 'CAJERO' }, OTHER_ADMIN_ID),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'El sistema debe tener al menos un administrador activo.',
    });
  });

  it('con otro administrador activo sí se le puede cambiar el rol', async () => {
    const { service } = setup([makeUser({ id: OTHER_ADMIN_ID, email: 'luis@correo.cr' })]);

    expect((await service.update(OWNER_ID, { role: 'ENCARGADO' }, OTHER_ADMIN_ID)).role).toBe(
      'ENCARGADO',
    );
  });

  it('rechaza el correo de otro usuario y avisa si no hay cambios', async () => {
    const { service } = setup();

    await expect(
      service.update(CAJERO_ID, { email: 'ana@correo.cr' }, OWNER_ID),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.update(CAJERO_ID, { name: 'Carlos' }, OWNER_ID)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('responde 404 si el usuario no existe', async () => {
    const { service } = setup();

    await expect(service.update(OTHER_ADMIN_ID, { name: 'Nadie' }, OWNER_ID)).rejects.toMatchObject(
      { statusCode: 404 },
    );
  });
});

describe('UsersService.deactivate / activate', () => {
  it('desactivar no borra al usuario y cierra sus sesiones', async () => {
    const { repository, service } = setup();

    expect((await service.deactivate(CAJERO_ID, OWNER_ID)).isActive).toBe(false);
    expect(stored(repository, CAJERO_ID)).toEqual(
      expect.objectContaining({ isActive: false, sessionVersion: 1 }),
    );
    expect((await service.activate(CAJERO_ID)).isActive).toBe(true);
  });

  it('nadie puede desactivar su propia cuenta', async () => {
    const { service } = setup();

    await expect(service.deactivate(OWNER_ID, OWNER_ID)).rejects.toMatchObject({
      statusCode: 409,
      message: 'No puede desactivar su propia cuenta.',
    });
  });

  it('no se puede desactivar al último administrador activo', async () => {
    const { repository, service } = setup([
      makeUser({ id: OTHER_ADMIN_ID, email: 'luis@correo.cr', role: 'ENCARGADO' }),
    ]);

    // El Encargado no podría llegar aquí (la ruta exige Configuración); se prueba la regla.
    await expect(service.deactivate(OWNER_ID, OTHER_ADMIN_ID)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(stored(repository, OWNER_ID)?.isActive).toBe(true);
  });
});

describe('UsersService.resetPassword (HU-13)', () => {
  it('genera una contraseña temporal nueva, obliga a cambiarla y cierra sus sesiones', async () => {
    const { repository, service } = setup();
    const before = stored(repository, CAJERO_ID)?.passwordHash;

    const result = await service.resetPassword(CAJERO_ID, OWNER_ID);
    const saved = stored(repository, CAJERO_ID);

    expect(saved?.passwordHash).not.toBe(before);
    expect(await verifyPassword(saved?.passwordHash ?? '', result.temporaryPassword)).toBe(true);
    expect(saved).toEqual(expect.objectContaining({ mustChangePassword: true, sessionVersion: 1 }));
  });

  it('la propia contraseña se cambia en «Mi perfil»', async () => {
    const { service } = setup();

    await expect(service.resetPassword(OWNER_ID, OWNER_ID)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
