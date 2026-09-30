import type { Request, Response } from 'express';
import type { HealthService } from '../services/health.service.js';

/**
 * Capa de controlador: adapta el mundo HTTP (req/res) con el service.
 *
 * No contiene reglas de negocio. En Express 5 un `throw` dentro de un handler
 * async llega solo al middleware de errores, así que no hace falta envolver los
 * llamados en try/catch.
 */
export class HealthController {
  constructor(private readonly service: HealthService) {}

  /** GET /api/health */
  getStatus(_req: Request, res: Response): void {
    res.status(200).json(this.service.getServiceStatus());
  }

  /** GET /api/health/database — devuelve 503 si la base no responde. */
  async getDatabaseStatus(_req: Request, res: Response): Promise<void> {
    const status = await this.service.getDatabaseStatus();

    res.status(status.connected ? 200 : 503).json(status);
  }
}
