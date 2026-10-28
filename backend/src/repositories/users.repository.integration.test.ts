import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectPrisma, prisma } from '../config/prisma.js';
import { ensureInitialAdmin } from '../services/initial-admin.service.js';
import { UsersRepository } from './users.repository.js';

/**
 * Integración contra PostgreSQL real (usuarios y roles).
 *
 * Borra la tabla `User`, por eso solo corre si DATABASE_URL apunta a una base
 * cuyo nombre termina en `_test`; con la base de desarrollo se omite sola.
 *   DATABASE_URL=postgresql://…/minisuper_test npm test -w backend
 */
const databaseName = new URL(process.env['DATABASE_URL'] ?? 'postgresql://x/none').pathname;
const isTestDatabase = databaseName.endsWith('_test');

const BASE = {
  passwordHash: '$argon2id$de-prueba',
  role: 'CAJERO',
  mustChangePassword: true,
} as const;

describe.skipIf(!isTestDatabase)('UsersRepository (PostgreSQL de prueba)', () => {
  const repository = new UsersRepository();

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.businessSettings.updateMany({ data: { maxUsers: 5 } });
    await disconnectPrisma();
  });

  it('de varias altas simultáneas con el mismo correo, solo una se guarda', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        repository.create({ ...BASE, name: `Cajero ${index}`, email: 'caja@correo.cr' }),
      ),
    );

    expect(results.filter((result) => result !== null)).toHaveLength(1);
    expect(await prisma.user.count()).toBe(1);
  });

  it('countActiveAdmins solo cuenta administradores activos', async () => {
    await repository.create({ ...BASE, role: 'ADMIN', name: 'Ana', email: 'ana@correo.cr' });
    const other = await repository.create({
      ...BASE,
      role: 'ADMIN',
      name: 'Luis',
      email: 'luis@correo.cr',
    });
    await repository.create({ ...BASE, name: 'Caja', email: 'caja@correo.cr' });

    expect(await repository.countActiveAdmins()).toBe(2);

    await repository.update(other?.id ?? '', { isActive: false });

    expect(await repository.countActiveAdmins()).toBe(1);
  });

  it('revokeSessions incrementa la versión de sesión de forma atómica (HU-15)', async () => {
    const created = await repository.create({ ...BASE, name: 'Ana', email: 'ana@correo.cr' });
    const id = created?.id ?? '';

    await Promise.all([repository.revokeSessions(id), repository.revokeSessions(id)]);

    expect((await repository.findById(id))?.sessionVersion).toBe(2);
  });

  it('update cambia rol y estado, y devuelve null si el correo ya es de otro', async () => {
    const ana = await repository.create({ ...BASE, name: 'Ana', email: 'ana@correo.cr' });
    await repository.create({ ...BASE, name: 'Luis', email: 'luis@correo.cr' });

    const updated = await repository.update(ana?.id ?? '', {
      role: 'BODEGA',
      isActive: false,
      revokeSessions: true,
    });

    expect(updated).toEqual(
      expect.objectContaining({ role: 'BODEGA', isActive: false, sessionVersion: 1 }),
    );
    expect(await repository.update(ana?.id ?? '', { email: 'luis@correo.cr' })).toBeNull();
  });

  it('el administrador inicial se crea una sola vez y guarda un hash Argon2id', async () => {
    const input = { name: 'Admin', email: 'admin@correo.cr', password: 'ClaveSegura123' };

    expect(await ensureInitialAdmin(repository, input)).toEqual({
      status: 'created',
      email: 'admin@correo.cr',
    });
    expect(await ensureInitialAdmin(repository, { ...input, password: 'OtraClave98765' })).toEqual({
      status: 'exists',
    });

    const rows = await prisma.user.findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({ role: 'ADMIN', mustChangePassword: true, isActive: true }),
    );
    expect(rows[0]?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(rows[0]?.passwordHash).not.toContain('ClaveSegura123');
  });

  it('límite del plan: de 6 altas simultáneas con 1 cupo libre, solo 1 se guarda', async () => {
    await prisma.businessSettings.updateMany({ data: { maxUsers: 2 } });
    await repository.create({ ...BASE, name: 'Ya estaba', email: 'ya@correo.cr' });

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        repository.createWithinPlan({
          ...BASE,
          name: `Cajero ${index}`,
          email: `cajero${index}@correo.cr`,
        }),
      ),
    );

    const created = results.filter((result) => result !== null && !('status' in result));

    expect(created).toHaveLength(1);
    expect(results.filter((result) => result !== null && 'status' in result)).toHaveLength(5);
    expect(await repository.countUsedSeats()).toBe(2);
  });

  it('límite del plan: los administradores no ocupan cupo y reactivar exige cupo', async () => {
    await prisma.businessSettings.updateMany({ data: { maxUsers: 1 } });

    const admin = await repository.createWithinPlan({
      ...BASE,
      role: 'ADMIN',
      name: 'Admin',
      email: 'admin@correo.cr',
    });
    const cajero = await repository.createWithinPlan({
      ...BASE,
      name: 'Caja',
      email: 'c@correo.cr',
    });
    const off = await repository.create({ ...BASE, name: 'Inactivo', email: 'i@correo.cr' });

    await repository.update(off?.id ?? '', { isActive: false });

    expect(admin).not.toHaveProperty('status');
    expect(cajero).not.toHaveProperty('status');
    expect(await repository.updateWithinPlan(off?.id ?? '', { isActive: true })).toEqual({
      status: 'plan-full',
      maxUsers: 1,
    });
  });
});
