import { env } from '../config/env.js';
import type { HealthRepository } from '../repositories/health.repository.js';

/** Estado del servicio HTTP. */
export interface ServiceStatus {
  status: 'ok';
  service: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
}

/** Estado de la conexión con PostgreSQL. */
export interface DatabaseStatus {
  connected: boolean;
  latencyMs: number;
  error?: string;
}

/**
 * Capa de lógica de negocio (o "de servicio").
 *
 * Aquí vivirían las reglas del MiniSuper (por ejemplo, en HU-17: "no se puede
 * vender una cantidad mayor a la existente"). El controller no decide reglas y
 * el repository no conoce reglas: ambos se comunican a través del service.
 *
 * El repository se recibe por constructor: en las pruebas se sustituye por uno
 * falso y se valida la lógica sin base de datos.
 */
export class HealthService {
  private static readonly SERVICE_NAME = 'minisuper-api';

  constructor(private readonly repository: HealthRepository) {}

  /** El backend está levantando: no necesita la base para responder. */
  getServiceStatus(): ServiceStatus {
    return {
      status: 'ok',
      service: HealthService.SERVICE_NAME,
      environment: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /** Pregunta al repository por la base y decide qué informar. */
  async getDatabaseStatus(): Promise<DatabaseStatus> {
    const probe = await this.repository.probeDatabase();

    return {
      connected: probe.ok,
      latencyMs: probe.latencyMs,
      ...(probe.error === undefined ? {} : { error: probe.error }),
    };
  }
}
