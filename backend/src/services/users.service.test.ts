import { describe, expect, it } from 'vitest';
import type { UserActor, UserRecord } from '../types/auth.js';
import { TEST_BUSINESS_ID } from '../testing/fake-session.js';
import { FakeUsersRepository, makeUser, OWNER_ID } from '../testing/users.repository.fake.js';
import { verifyPassword } from '../utils/password.js';
import { TEMPORARY_PASSWORD_LENGTH } from '../utils/temporary-password.js';
import { UsersService } from './users.service.js';

/**
 * Configuración › Usuarios con jerarquía, plan y multi-negocio (criterios de
 * HU-11 a HU-15; ADR 0002).
 */

const ENCARGADO_ID = '22222222-2222-4222-8222-222222222222';
const CAJERO_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_ADMIN_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_BUSINESS_ID = '0b000000-0000-4000-8000-000000000002';
const OTHER_CAJERO_ID = '55555555-5555-4555-8555-555555555555';

const ADMIN: UserActor = { id: OWNER_ID, role: 'ADMIN', businessId: null };
const ENCARGADO: UserActor = { id: ENCARGADO_ID, role: 'ENCARGADO', businessId: TEST_BUSINESS_ID };

const encargado = makeUser({
  id: ENCARGADO_ID,
  name: 'Elena',
  email: 'elena@correo.cr',
  role: 'ENCARGADO',
});
const cajero = makeUser({ id: CAJERO_ID, name: 'Carlos', email: 'caja@correo.cr', role: 'CAJERO' });
/** Personal de OTRO negocio: el Encargado de prueba no debe verlo ni tocarlo. */
const otherCajero = makeUser({
  id: OTHER_CAJERO_ID,
  name: 'Otro',
  email: 'otro@correo.cr',
  role: 'CAJERO',
  businessId: OTHER_BUSINESS_ID,
});

function setup(users: UserRecord[] = [encargado, cajero, otherCajero], maxUsers = 5) {
  const repository = new FakeUsersRepository([makeUser(), ...users], { maxUsers });

  return { repository, service: new UsersService(repository) };
}

const stored = (repository: FakeUsersRepository, id: string) =>
  repository.stored.find((user) => user.id === id);

const NEW_USER = { name: 'Bea', email: 'bea@correo.cr', role: 'BODEGA' } as const;

describe('UsersService.create', () => {
  it('el Encargado crea personal con una contraseña temporal que debe cambiar', async () => {
    const { repository, service } = setup();

    const result = await service.create(NEW_USER, ENCARGADO);

    expect(result.temporaryPassword).toHaveLength(TEMPORARY_PASSWORD_LENGTH);
    expect(result.user).toEqual(
      expect.objectContaining({ role: 'BODEGA', isActive: true, mustChangePassword: true }),
    );
    expect(result.user).not.toHaveProperty('passwordHash');

    const saved = stored(repository, result.user.id);

    expect(saved?.businessId).toBe(TEST_BUSINESS_ID);
    expect(await verifyPassword(saved?.passwordHash ?? '', result.temporaryPassword)).toBe(true);
  });

  it('el Encargado crea SIEMPRE en su negocio, aunque mande otro', async () => {
    const { repository, service } = setup();

    const result = await service.create({ ...NEW_USER, businessId: OTHER_BUSINESS_ID }, ENCARGADO);

    expect(stored(repository, result.user.id)?.businessId).toBe(TEST_BUSINESS_ID);
  });

  it('rechaza un correo que ya está en uso (409)', async () => {
    const { service } = setup();

    await expect(
      service.create({ ...NEW_USER, email: 'caja@correo.cr' }, ENCARGADO),
    ).rejects.toMatchObject({ statusCode: 409, message: 'Ese correo ya está en uso.' });
  });

  it.each(['ENCARGADO', 'ADMIN'] as const)(
    'el Encargado no puede crear un usuario %s (403)',
    async (role) => {
      const { repository, service } = setup();

      await expect(service.create({ ...NEW_USER, role }, ENCARGADO)).rejects.toMatchObject({
        statusCode: 403,
        message: 'Solo puede administrar usuarios de un rango menor al suyo.',
      });
      expect(repository.stored).toHaveLength(4);
    },
  );

  it('la plataforma crea Encargados para un negocio existente', async () => {
    const { repository, service } = setup();

    const result = await service.create(
      { ...NEW_USER, role: 'ENCARGADO', businessId: OTHER_BUSINESS_ID },
      ADMIN,
    );

    expect(stored(repository, result.user.id)?.businessId).toBe(OTHER_BUSINESS_ID);
  });

  it('la plataforma debe indicar un negocio que exista para el Encargado', async () => {
    const { service } = setup();

    await expect(service.create({ ...NEW_USER, role: 'ENCARGADO' }, ADMIN)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Indique el negocio del Encargado.',
    });
    await expect(
      service.create(
        { ...NEW_USER, role: 'ENCARGADO', businessId: '0b000000-0000-4000-8000-0000000000ff' },
        ADMIN,
      ),
    ).rejects.toMatchObject({ statusCode: 400, message: 'El negocio indicado no existe.' });
  });

  it('la plataforma crea administradores sin negocio, pero no personal de un negocio (403)', async () => {
    const { repository, service } = setup();

    const admin = await service.create({ ...NEW_USER, role: 'ADMIN' }, ADMIN);

    expect(stored(repository, admin.user.id)?.businessId).toBeNull();
    await expect(
      service.create({ ...NEW_USER, email: 'x@correo.cr', role: 'CAJERO' }, ADMIN),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('límite de usuarios del plan (por negocio)', () => {
  it('con el plan lleno no deja crear más usuarios y explica qué hacer', async () => {
    // Plan de 2: el Encargado y el Cajero ya los ocupan.
    const { service } = setup(undefined, 2);

    await expect(service.create(NEW_USER, ENCARGADO)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/El plan permite 2 usuarios activos/),
    });
  });

  it('el plan de un negocio no se gasta con los usuarios de otro', async () => {
    // El otro negocio tiene 1 usuario (otherCajero); el de prueba, 2.
    const { service } = setup([encargado, otherCajero], 2);

    expect((await service.create(NEW_USER, ENCARGADO)).user.role).toBe('BODEGA');
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
});

describe('UsersService.list', () => {
  it('la plataforma ve administradores y Encargados de todos los negocios, no al personal', async () => {
    const { service } = setup();

    expect((await service.list(ADMIN)).map((user) => user.role).sort()).toEqual([
      'ADMIN',
      'ENCARGADO',
    ]);
  });

  it('el Encargado ve a su personal y a sí mismo, nunca otro negocio ni la plataforma', async () => {
    const { service } = setup();

    expect((await service.list(ENCARGADO)).map((user) => user.id).sort()).toEqual(
      [ENCARGADO_ID, CAJERO_ID].sort(),
    );
  });
});

describe('aislamiento entre negocios', () => {
  it.each([
    [
      'editar',
      (service: UsersService) => service.update(OTHER_CAJERO_ID, { name: 'X' }, ENCARGADO),
    ],
    ['desactivar', (service: UsersService) => service.deactivate(OTHER_CAJERO_ID, ENCARGADO)],
    ['restablecer', (service: UsersService) => service.resetPassword(OTHER_CAJERO_ID, ENCARGADO)],
  ])(
    'el Encargado no puede %s a alguien de otro negocio: para él no existe (404)',
    async (_, act) => {
      const { repository, service } = setup();

      await expect(act(service)).rejects.toMatchObject({ statusCode: 404 });
      expect(stored(repository, OTHER_CAJERO_ID)).toEqual(otherCajero);
    },
  );
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

    await service.update(CAJERO_ID, { name: 'Carlos Mora' }, ENCARGADO);

    expect(stored(repository, CAJERO_ID)?.sessionVersion).toBe(0);
  });

  it('el Encargado no puede ascender a nadie a Encargado (403)', async () => {
    const { service } = setup();

    await expect(service.update(CAJERO_ID, { role: 'ENCARGADO' }, ENCARGADO)).rejects.toMatchObject(
      { statusCode: 403 },
    );
  });

  it('la plataforma y los negocios no se mezclan: un Encargado no pasa a administrador', async () => {
    const { service } = setup();

    await expect(service.update(ENCARGADO_ID, { role: 'ADMIN' }, ADMIN)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('cada uno puede corregir su propio nombre, pero no su rol', async () => {
    const { service } = setup();

    expect((await service.update(ENCARGADO_ID, { name: 'Elena R.' }, ENCARGADO)).name).toBe(
      'Elena R.',
    );
    await expect(service.update(OWNER_ID, { role: 'ENCARGADO' }, ADMIN)).rejects.toMatchObject({
      statusCode: 409,
      message: 'No puede cambiar su propio rol.',
    });
  });

  it('rechaza el correo de otro usuario y avisa si no hay cambios', async () => {
    const { service } = setup();

    await expect(
      service.update(CAJERO_ID, { email: 'elena@correo.cr' }, ENCARGADO),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.update(CAJERO_ID, { name: 'Carlos' }, ENCARGADO)).rejects.toMatchObject({
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

  it('la plataforma puede desactivar a un Encargado (por ejemplo, si deja el negocio)', async () => {
    const { service } = setup();

    expect((await service.deactivate(ENCARGADO_ID, ADMIN)).isActive).toBe(false);
  });

  it('no se puede desactivar al último administrador activo', async () => {
    const { repository, service } = setup([
      makeUser({ id: OTHER_ADMIN_ID, email: 'luis@correo.cr', isActive: false }),
    ]);

    await expect(
      service.deactivate(OWNER_ID, { id: OTHER_ADMIN_ID, role: 'ADMIN', businessId: null }),
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

  it('la plataforma restablece la contraseña de un Encargado que la olvidó', async () => {
    const { service } = setup();

    expect((await service.resetPassword(ENCARGADO_ID, ADMIN)).user.mustChangePassword).toBe(true);
  });

  it('la propia contraseña se cambia en «Mi perfil»', async () => {
    const { service } = setup();

    await expect(service.resetPassword(OWNER_ID, ADMIN)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
