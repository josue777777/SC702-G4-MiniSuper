import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectPrisma, prisma } from '../config/prisma.js';
import { ensureInitialAdmin } from '../services/initial-admin.service.js';
import { UsersRepository } from './users.repository.js';

/**
 * Integración contra PostgreSQL real (usuarios, roles y plan por negocio).
 *
 * Borra la tabla `User`, por eso solo corre si DATABASE_URL apunta a una base
 * cuyo nombre termina en `_test`; con la base de desarrollo se omite sola.
 *   DATABASE_URL=postgresql://…/minisuper_test npm test -w backend
 */
const databaseName = new URL(process.env['DATABASE_URL'] ?? 'postgresql://x/none').pathname;
const isTestDatabase = databaseName.endsWith('_test');

const BUSINESS_ID = '0b000000-0000-4000-8000-000000000021';
const OTHER_BUSINESS_ID = '0b000000-0000-4000-8000-000000000022';

const BASE = {
  businessId: BUSINESS_ID,
  passwordHash: '$argon2id$de-prueba',
  role: 'CAJERO',
  mustChangePassword: true,
} as const;

/** Plan del negocio de prueba: el Encargado más `extraUsers`. */
async function setExtraUsers(extraUsers: number, businessId = BUSINESS_ID): Promise<void> {
  await prisma.business.update({ where: { id: businessId }, data: { extraUsers } });
}

describe.skipIf(!isTestDatabase)('UsersRepository (PostgreSQL de prueba)', () => {
  const repository = new UsersRepository();

  beforeEach(async () => {
    await prisma.planRequest.deleteMany();
    await prisma.user.deleteMany();

    for (const [id, name] of [
      [BUSINESS_ID, 'Negocio A'],
      [OTHER_BUSINESS_ID, 'Negocio B'],
    ] as const) {
      await prisma.business.upsert({
        where: { id },
        create: { id, name, extraUsers: 4 },
        update: { extraUsers: 4, status: 'ACTIVE' },
      });
    }
  });

  afterAll(async () => {
    await prisma.planRequest.deleteMany();
    await prisma.user.deleteMany();
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
    const admin = { ...BASE, businessId: null, role: 'ADMIN' } as const;

    await repository.create({ ...admin, name: 'Ana', email: 'ana@correo.cr' });
    const other = await repository.create({ ...admin, name: 'Luis', email: 'luis@correo.cr' });
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

  it('el registro trae el negocio y su estado (para cortar sesiones si se suspende)', async () => {
    const created = await repository.create({ ...BASE, name: 'Ana', email: 'ana@correo.cr' });

    await prisma.business.update({ where: { id: BUSINESS_ID }, data: { status: 'SUSPENDED' } });

    expect(await repository.findById(created?.id ?? '')).toEqual(
      expect.objectContaining({
        businessId: BUSINESS_ID,
        businessName: 'Negocio A',
        businessStatus: 'SUSPENDED',
      }),
    );
  });

  it('la base no deja un Cajero sin negocio ni un Administrador con negocio', async () => {
    await expect(
      repository.create({ ...BASE, businessId: null, name: 'X', email: 'x@correo.cr' }),
    ).rejects.toThrow();
    await expect(
      repository.create({ ...BASE, role: 'ADMIN', name: 'Y', email: 'y@correo.cr' }),
    ).rejects.toThrow();
  });

  it('plan: de 6 altas simultáneas con 1 cupo libre en el negocio, solo 1 se guarda', async () => {
    await setExtraUsers(1); // Encargado + 1 = 2 cupos
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
    expect(await repository.countUsedSeats(BUSINESS_ID)).toBe(2);
  });

  it('plan: cada negocio usa sus cupos; los administradores no ocupan cupo', async () => {
    await setExtraUsers(0); // solo 1 cupo en el negocio A
    await repository.create({ ...BASE, name: 'Lleno', email: 'lleno@correo.cr' });

    const inOther = await repository.createWithinPlan({
      ...BASE,
      businessId: OTHER_BUSINESS_ID,
      name: 'Otro negocio',
      email: 'otro@correo.cr',
    });
    const admin = await repository.createWithinPlan({
      ...BASE,
      businessId: null,
      role: 'ADMIN',
      name: 'Admin',
      email: 'admin@correo.cr',
    });
    const full = await repository.createWithinPlan({
      ...BASE,
      name: 'Más',
      email: 'mas@correo.cr',
    });

    expect(inOther).not.toHaveProperty('status');
    expect(admin).not.toHaveProperty('status');
    expect(full).toEqual({ status: 'plan-full', maxUsers: 1 });
  });

  it('plan: reactivar a alguien exige cupo en su negocio', async () => {
    await setExtraUsers(0);
    const off = await repository.create({ ...BASE, name: 'Inactivo', email: 'i@correo.cr' });

    await repository.update(off?.id ?? '', { isActive: false });
    await repository.create({ ...BASE, name: 'Activo', email: 'a@correo.cr' });

    expect(await repository.updateWithinPlan(off?.id ?? '', { isActive: true })).toEqual({
      status: 'plan-full',
      maxUsers: 1,
    });
  });

  it('el administrador inicial se crea una sola vez, sin negocio y con hash Argon2id', async () => {
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
      expect.objectContaining({ role: 'ADMIN', businessId: null, mustChangePassword: true }),
    );
    expect(rows[0]?.passwordHash).toMatch(/^\$argon2id\$/);
  });
});
