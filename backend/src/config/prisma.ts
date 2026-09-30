import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from './env.js';

/**
 * Cliente Prisma único para toda la aplicación.
 *
 * Prisma 7 ya no incluye un motor de consulta propio: la conexión la abre el
 * conductor nativo `pg` a través del adaptador `@prisma/adapter-pg`. Por eso la
 * cadena de conexión se pasa aquí y en `prisma7.config.ts` (para la CLI), y NO
 * en `schema.prisma`.
 *
 * Se exporta una sola instancia: crear un PrismaClient por petición agotaría el
 * pool de conexiones.
 */
const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const prisma = new PrismaClient({ adapter });

/**
 * Cierra el pool de conexiones. Se llama en el apagado ordenado del servidor
 * (`src/server.ts`) y al terminar las pruebas.
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
