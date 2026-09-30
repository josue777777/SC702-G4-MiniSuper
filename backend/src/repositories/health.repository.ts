import { prisma } from '../config/prisma.js';

/** Resultado de intentar leer la base de datos. */
export interface DatabaseProbe {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

/**
 * Capa de acceso a datos del módulo de salud.
 *
 * Es la ÚNICA capa de este flujo que habla con Prisma. Las capas superiores no
 * saben que existe PostgreSQL, y por eso el service se puede probar con un
 * repositorio falso (ver `health.service.test.ts`).
 */
export class HealthRepository {
  /**
   * Ejecuta la consulta más barata posible y mide cuánto tarda.
   * No lanza el error: lo devuelve como `{ ok: false }` para que el resto del
   * flujo pueda responder "base de datos no disponible" sin romper la petición.
   */
  async probeDatabase(): Promise<DatabaseProbe> {
    const startedAt = performance.now();

    try {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
    } catch (cause) {
      return {
        ok: false,
        latencyMs: Math.round(performance.now() - startedAt),
        error: cause instanceof Error ? cause.message : 'Error desconocido',
      };
    }
  }
}
