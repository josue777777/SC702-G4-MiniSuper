import { describe, expect, it } from 'vitest';
import type { DatabaseProbe, HealthRepository } from '../repositories/health.repository.js';
import { HealthService } from './health.service.js';

/**
 * Prueba unitaria del service, SIN base de datos.
 *
 * Es el beneficio de separar capas: se inyecta un repositorio falso y se
 * comprueba qué decide la lógica de negocio. Cuando haya repositories reales
 * (productos, ventas), la misma técnica sirve para probar reglas como
 * "no se puede vender más stock del disponible" (HU-17).
 */
class FakeHealthRepository implements HealthRepository {
  constructor(private readonly probe: DatabaseProbe) {}

  probeDatabase(): Promise<DatabaseProbe> {
    return Promise.resolve(this.probe);
  }
}

describe('HealthService.getDatabaseStatus', () => {
  it('informa conexión correcta cuando la base responde', async () => {
    const service = new HealthService(new FakeHealthRepository({ ok: true, latencyMs: 4 }));

    await expect(service.getDatabaseStatus()).resolves.toEqual({
      connected: true,
      latencyMs: 4,
    });
  });

  it('informa el error cuando la base no responde', async () => {
    const service = new HealthService(
      new FakeHealthRepository({
        ok: false,
        latencyMs: 5_000,
        error: 'ECONNREFUSED',
      }),
    );

    await expect(service.getDatabaseStatus()).resolves.toEqual({
      connected: false,
      latencyMs: 5_000,
      error: 'ECONNREFUSED',
    });
  });
});

describe('HealthService.getServiceStatus', () => {
  it('devuelve el estado del servicio sin tocar la base de datos', () => {
    const service = new HealthService(new FakeHealthRepository({ ok: false, latencyMs: 0 }));

    const status = service.getServiceStatus();

    expect(status.status).toBe('ok');
    expect(status.service).toBe('minisuper-api');
    expect(typeof status.uptimeSeconds).toBe('number');
  });
});
