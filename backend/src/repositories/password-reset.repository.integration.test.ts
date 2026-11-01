import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectPrisma, prisma } from '../config/prisma.js';
import { hashResetToken } from '../utils/reset-token.js';
import { PasswordResetRepository } from './password-reset.repository.js';
import { UsersRepository } from './users.repository.js';

/**
 * Recuperación de contraseña contra PostgreSQL real (HU-13). Solo corre con una
 * base `*_test` (ver `users.repository.integration.test.ts`).
 */
const databaseName = new URL(process.env['DATABASE_URL'] ?? 'postgresql://x/none').pathname;

const BUSINESS_ID = '0b000000-0000-4000-8000-000000000031';
const NOW = new Date('2026-11-01T12:00:00Z');
const LATER = new Date('2026-11-01T12:30:00Z');
const TOKEN_HASH = hashResetToken('token-de-prueba-suficientemente-largo');

describe.skipIf(!databaseName.endsWith('_test'))(
  'PasswordResetRepository (PostgreSQL de prueba)',
  () => {
    const repository = new PasswordResetRepository();
    let userId: string;

    beforeEach(async () => {
      await prisma.planRequest.deleteMany();
      await prisma.accessEvent.deleteMany();
      await prisma.user.deleteMany();
      await prisma.business.upsert({
        where: { id: BUSINESS_ID },
        create: { id: BUSINESS_ID, name: 'Negocio recuperación' },
        update: { status: 'ACTIVE' },
      });

      const user = await prisma.user.create({
        data: {
          businessId: BUSINESS_ID,
          name: 'Elena',
          email: 'elena@recupera.cr',
          passwordHash: 'hash-viejo',
          role: 'ENCARGADO',
        },
      });

      userId = user.id;
      await repository.saveToken(userId, TOKEN_HASH, LATER);
    });

    afterAll(async () => {
      await prisma.accessEvent.deleteMany();
      await prisma.user.deleteMany();
      await disconnectPrisma();
    });

    it('el enlace vigente encuentra la cuenta; vencido, no', async () => {
      expect((await repository.findByToken(TOKEN_HASH, NOW))?.email).toBe('elena@recupera.cr');
      expect(await repository.findByToken(TOKEN_HASH, LATER)).toBeNull();
    });

    it('usarlo cambia la contraseña, cierra las sesiones, borra el enlace y deja el registro', async () => {
      expect(
        await repository.completeReset(
          { id: userId, businessId: BUSINESS_ID },
          TOKEN_HASH,
          'hash-nuevo',
          NOW,
        ),
      ).toBe(true);

      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

      expect(user).toMatchObject({
        passwordHash: 'hash-nuevo',
        sessionVersion: 1,
        passwordResetToken: null,
        passwordResetExpires: null,
      });
      expect(await prisma.accessEvent.findMany({ where: { userId } })).toEqual([
        expect.objectContaining({
          type: 'PASSWORD_RECOVERED_BY_EMAIL',
          businessId: BUSINESS_ID,
          actorId: null,
        }),
      ]);
    });

    it('dos usos al mismo tiempo: solo uno funciona', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          repository.completeReset(
            { id: userId, businessId: BUSINESS_ID },
            TOKEN_HASH,
            `hash-${index}`,
            NOW,
          ),
        ),
      );

      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await prisma.accessEvent.count({ where: { userId } })).toBe(1);
    });

    it('si la contraseña cambia por otra vía, el enlace pendiente deja de servir', async () => {
      await new UsersRepository().update(userId, { passwordHash: 'hash-por-perfil' });

      expect(await repository.findByToken(TOKEN_HASH, NOW)).toBeNull();
    });
  },
);
