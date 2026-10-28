import { describe, expect, it } from 'vitest';
import { FakeUsersRepository, makeUser } from '../testing/users.repository.fake.js';
import { verifyPassword } from '../utils/password.js';
import { ensureInitialAdmin } from './initial-admin.service.js';

/** Administrador inicial con `npm run db:seed` (HU-12). */
const INPUT = { name: 'Administrador', email: 'admin@minisuper.local', password: 'CambieEsta123' };

describe('ensureInitialAdmin', () => {
  it('sin administradores crea uno con contraseña temporal (debe cambiarla)', async () => {
    const repository = new FakeUsersRepository();

    expect(await ensureInitialAdmin(repository, INPUT)).toEqual({
      status: 'created',
      email: INPUT.email,
    });

    const [admin] = repository.stored;

    expect(admin).toEqual(
      expect.objectContaining({ role: 'ADMIN', isActive: true, mustChangePassword: true }),
    );
    expect(admin?.passwordHash).not.toContain(INPUT.password);
    expect(await verifyPassword(admin?.passwordHash ?? '', INPUT.password)).toBe(true);
  });

  it('si ya hay un administrador activo no crea otro ni cambia nada', async () => {
    const existing = makeUser();
    const repository = new FakeUsersRepository([existing]);

    expect(await ensureInitialAdmin(repository, INPUT)).toEqual({ status: 'exists' });
    expect(repository.stored).toEqual([existing]);
  });

  it('si el único administrador está inactivo, crea uno nuevo', async () => {
    const repository = new FakeUsersRepository([makeUser({ isActive: false })]);

    expect((await ensureInitialAdmin(repository, INPUT)).status).toBe('created');
    expect(repository.stored).toHaveLength(2);
  });

  it('avisa si el correo ya es de otro usuario', async () => {
    const repository = new FakeUsersRepository([makeUser({ role: 'CAJERO', email: INPUT.email })]);

    expect(await ensureInitialAdmin(repository, INPUT)).toEqual({
      status: 'email-in-use',
      email: INPUT.email,
    });
  });
});
