import { beforeEach, describe, expect, it } from 'vitest';
import { FakeUsersRepository, OWNER_ID } from '../testing/users.repository.fake.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { ProfileService } from './profile.service.js';

/** Reglas del perfil del dueño (HU-14), con el doble de repositorio. */

const PASSWORD = 'ClaveSegura123';

let repository: FakeUsersRepository;
let service: ProfileService;

beforeEach(async () => {
  repository = new FakeUsersRepository([
    {
      id: OWNER_ID,
      name: 'Ana Pérez',
      email: 'ana@correo.cr',
      passwordHash: await hashPassword(PASSWORD),
      sessionVersion: 0,
    },
  ]);
  service = new ProfileService(repository);
});

describe('ProfileService.getProfile', () => {
  it('devuelve nombre y correo actuales, sin hash', async () => {
    expect(await service.getProfile(OWNER_ID)).toEqual({
      id: OWNER_ID,
      name: 'Ana Pérez',
      email: 'ana@correo.cr',
    });
  });
});

describe('ProfileService.updateProfile', () => {
  it('actualiza el nombre sin pedir la contraseña actual', async () => {
    const result = await service.updateProfile(OWNER_ID, { name: 'Ana María' });

    expect(result.profile.name).toBe('Ana María');
    expect(result.renewedSession).toBeUndefined();
  });

  it('cambiar el correo exige la contraseña actual correcta', async () => {
    await expect(
      service.updateProfile(OWNER_ID, { email: 'nuevo@correo.cr' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.updateProfile(OWNER_ID, {
        email: 'nuevo@correo.cr',
        currentPassword: 'mala12345678',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect((await service.getProfile(OWNER_ID)).email).toBe('ana@correo.cr');

    const result = await service.updateProfile(OWNER_ID, {
      email: 'nuevo@correo.cr',
      currentPassword: PASSWORD,
    });

    expect(result.profile.email).toBe('nuevo@correo.cr');
  });

  it('cambia la contraseña guardando un hash nuevo que sirve para la clave nueva', async () => {
    const result = await service.updateProfile(OWNER_ID, {
      newPassword: 'OtraClave456789',
      currentPassword: PASSWORD,
    });

    expect(result.renewedSession?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(result.renewedSession?.sessionVersion).toBe(0);
    expect(await verifyPassword(repository.stored[0]?.passwordHash ?? '', 'OtraClave456789')).toBe(
      true,
    );
    expect(await verifyPassword(repository.stored[0]?.passwordHash ?? '', PASSWORD)).toBe(false);
  });

  it('rechaza una contraseña nueva igual a la actual', async () => {
    await expect(
      service.updateProfile(OWNER_ID, { newPassword: PASSWORD, currentPassword: PASSWORD }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('responde 400 si no hay cambios reales', async () => {
    await expect(service.updateProfile(OWNER_ID, { name: 'Ana Pérez' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('responde 404 si la cuenta de la sesión ya no existe', async () => {
    await expect(
      service.updateProfile('99999999-9999-4999-8999-999999999999', { name: 'X' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
