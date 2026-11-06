import { afterAll, describe, expect, it } from 'vitest';
import { disconnectPrisma, prisma } from '../../config/prisma.js';
import { generateDemo } from './generate-demo.js';
import { DEMO_BUSINESS_ID, DEMO_USERS, removeDemo, writeDemo } from './write-demo.js';

/**
 * Guarda el negocio de demostración en PostgreSQL real y revisa que quede
 * completo, que se pueda rehacer y que no toque otros negocios.
 *
 * Borra datos: solo corre si DATABASE_URL apunta a una base `*_test`.
 */
const databaseName = new URL(process.env['DATABASE_URL'] ?? 'postgresql://x/none').pathname;

const plan = generateDemo({
  now: new Date(),
  days: 20,
  salesPerDay: 6,
  maxProducts: 30,
  seed: 11,
});

describe.skipIf(!databaseName.endsWith('_test'))(
  'Datos de demostración (PostgreSQL de prueba)',
  () => {
    afterAll(async () => {
      await removeDemo(prisma);
      await disconnectPrisma();
    });

    it('crea el negocio con sus usuarios, catálogo, ventas y kardex consistentes', async () => {
      const otherBusinesses = await prisma.business.count({
        where: { id: { not: DEMO_BUSINESS_ID } },
      });

      await writeDemo(prisma, plan, 'hash-de-prueba');

      const business = { businessId: DEMO_BUSINESS_ID };

      expect(await prisma.product.count({ where: business })).toBe(plan.products.length);
      expect(await prisma.sale.count({ where: business })).toBe(plan.sales.length);
      expect(await prisma.inventoryMovement.count({ where: { product: business } })).toBe(
        plan.movements.length,
      );
      expect(
        (await prisma.user.findMany({ where: business, select: { username: true } }))
          .map((user) => user.username)
          .sort(),
      ).toEqual(DEMO_USERS.map((user) => user.username).sort());

      // El stock guardado es el saldo del último movimiento de cada producto.
      for (const product of await prisma.product.findMany({ where: business })) {
        const last = await prisma.inventoryMovement.findFirst({
          where: { productId: product.id },
          orderBy: { createdAt: 'desc' },
        });

        expect(last?.stockAfter).toBe(product.stock);
      }

      // La próxima venta real continúa el consecutivo.
      const sequence = await prisma.documentSequence.findUnique({
        where: { businessId_kind: { businessId: DEMO_BUSINESS_ID, kind: 'SALE' } },
      });

      expect(sequence?.next).toBe(plan.sales.length + 1);
      expect(await prisma.business.count({ where: { id: { not: DEMO_BUSINESS_ID } } })).toBe(
        otherBusinesses,
      );
    });

    it('se puede correr otra vez: rehace el demo sin duplicar nada', async () => {
      await writeDemo(prisma, plan, 'hash-de-prueba');

      expect(await prisma.product.count({ where: { businessId: DEMO_BUSINESS_ID } })).toBe(
        plan.products.length,
      );
      expect(await removeDemo(prisma)).toBe(true);
      expect(await prisma.business.findUnique({ where: { id: DEMO_BUSINESS_ID } })).toBeNull();
      expect(await removeDemo(prisma)).toBe(false);
    });
  },
);
