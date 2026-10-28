import { describe, expect, it } from 'vitest';
import { FakeUsersRepository, makeUser } from '../testing/users.repository.fake.js';
import { verifyPassword } from '../utils/password.js';
import {
  ensureInitialAdmin,
  NO_ACTIVE_ADMIN_WARNING,
  warnIfNoActiveAdmin,
} from './initial-admin.service.js';

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

describe('warnIfNoActiveAdmin (aviso al arrancar el servidor)', () => {
  function capture() {
    const messages: string[] = [];

    return { messages, log: (message: string) => messages.push(message) };
  }

  it('sin administradores avisa en la consola con los pasos para crearlo', async () => {
    const { messages, log } = capture();

    expect(await warnIfNoActiveAdmin(new FakeUsersRepository(), log)).toBe('missing');
    expect(messages).toEqual([NO_ACTIVE_ADMIN_WARNING]);
    expect(messages[0]).toContain('npm run db:seed');
  });

  it('también avisa si los únicos administradores están desactivados', async () => {
    const { messages, log } = capture();
    const repository = new FakeUsersRepository([
      makeUser({ isActive: false }),
      makeUser({
        id: '22222222-2222-4222-8222-222222222222',
        role: 'CAJERO',
        email: 'c@correo.cr',
      }),
    ]);

    expect(await warnIfNoActiveAdmin(repository, log)).toBe('missing');
    expect(messages).toHaveLength(1);
  });

  it('con un administrador activo no dice nada', async () => {
    const { messages, log } = capture();

    expect(await warnIfNoActiveAdmin(new FakeUsersRepository([makeUser()]), log)).toBe('ok');
    expect(messages).toEqual([]);
  });

  it('el aviso no muestra correos ni contraseñas', () => {
    expect(NO_ACTIVE_ADMIN_WARNING).not.toMatch(/@|CambieEsta|Admin12345/);
  });

  it('si la base no responde, lo indica y no lanza el error (el servidor sigue arrancando)', async () => {
    const { messages, log } = capture();
    const repository = new FakeUsersRepository();

    repository.countActiveAdmins = () =>
      Promise.reject(new Error('Invalid `prisma.user.count()`\n\n  → código\nECONNREFUSED'));

    expect(await warnIfNoActiveAdmin(repository, log)).toBe('unknown');
    expect(messages[0]).toContain('la base de datos no respondió');
    // Solo la causa, sin el código que Prisma agrega antes.
    expect(messages[0]).toContain('Detalle: ECONNREFUSED');
    expect(messages[0]).not.toContain('prisma.user.count');
  });
});
