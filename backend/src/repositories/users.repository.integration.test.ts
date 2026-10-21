import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectPrisma, prisma } from '../config/prisma.js';
import { AuthService } from '../services/auth.service.js';
import { LoginRateLimiter } from '../utils/login-rate-limiter.js';
import { UsersRepository } from './users.repository.js';

/**
 * Integración contra PostgreSQL real (HU-12: cuenta única bajo concurrencia).
 *
 * Borra la tabla `User`, por eso solo corre si DATABASE_URL apunta a una base
 * cuyo nombre termina en `_test`; con la base de desarrollo se omite sola.
 *   DATABASE_URL=postgresql://…/minisuper_test npm test -w backend
 */
const databaseName = new URL(process.env['DATABASE_URL'] ?? 'postgresql://x/none').pathname;
const isTestDatabase = databaseName.endsWith('_test');

describe.skipIf(!isTestDatabase)('UsersRepository (PostgreSQL de prueba)', () => {
  const repository = new UsersRepository();

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await disconnectPrisma();
  });

  it('solo una de varias altas simultáneas crea la cuenta', async () => {
    const attempts = Array.from({ length: 8 }, (_, index) =>
      repository.createOwner({
        name: `Dueño ${index}`,
        email: `dueno${index}@correo.cr`,
        passwordHash: '$argon2id$de-prueba',
      }),
    );

    const results = await Promise.all(attempts);

    expect(results.filter((result) => result !== null)).toHaveLength(1);
    expect(await repository.count()).toBe(1);
  });

  it('AuthService: solicitudes de configuración simultáneas dejan exactamente un usuario', async () => {
    const service = new AuthService(repository, {
      sessionSecret: 's'.repeat(40),
      requireSetupToken: false,
      limiter: new LoginRateLimiter(),
    });

    const settled = await Promise.allSettled(
      Array.from({ length: 6 }, (_, index) =>
        service.setupOwner({
          name: 'Ana',
          email: `ana${index}@correo.cr`,
          password: 'ClaveSegura123',
        }),
      ),
    );

    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    for (const result of settled) {
      if (result.status === 'rejected') {
        expect(result.reason).toMatchObject({ statusCode: 409 });
      }
    }
    expect(await prisma.user.count()).toBe(1);
  });

  it('guarda un hash Argon2id y no la contraseña en texto plano', async () => {
    const service = new AuthService(repository, {
      sessionSecret: 's'.repeat(40),
      requireSetupToken: false,
      limiter: new LoginRateLimiter(),
    });

    await service.setupOwner({ name: 'Ana', email: 'ana@correo.cr', password: 'ClaveSegura123' });
    const row = await prisma.user.findUniqueOrThrow({ where: { email: 'ana@correo.cr' } });

    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row.passwordHash).not.toContain('ClaveSegura123');
  });

  it('revokeSessions incrementa la versión de sesión de forma atómica (HU-15)', async () => {
    const created = await repository.createOwner({
      name: 'Ana',
      email: 'ana@correo.cr',
      passwordHash: '$argon2id$de-prueba',
    });
    const id = created?.id ?? '';

    expect((await repository.findById(id))?.sessionVersion).toBe(0);

    await Promise.all([repository.revokeSessions(id), repository.revokeSessions(id)]);

    expect((await repository.findById(id))?.sessionVersion).toBe(2);
  });

  it('actualiza nombre y correo y los vuelve a leer', async () => {
    const created = await repository.createOwner({
      name: 'Ana',
      email: 'ana@correo.cr',
      passwordHash: '$argon2id$de-prueba',
    });

    await repository.update(created?.id ?? '', { name: 'Ana María', email: 'nuevo@correo.cr' });

    expect(await repository.findByEmail('nuevo@correo.cr')).toEqual(
      expect.objectContaining({ name: 'Ana María' }),
    );
  });
});
