import type { Request, Response } from 'express';
import type { BusinessService } from '../services/business.service.js';
import { businessSettingsSchema } from '../validators/business.validator.js';

/** Capa de controlador de Configuración › General (datos del negocio). */
export class BusinessController {
  constructor(private readonly service: BusinessService) {}

  /** `GET /api/business` — datos completos (con sesión). */
  async get(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.service.get() });
  }

  /** `GET /api/business/public` — solo el nombre, para la pantalla de login. */
  async getPublic(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.service.getPublic() });
  }

  /** `PUT /api/business` — guarda los datos (solo Administrador). */
  async update(req: Request, res: Response): Promise<void> {
    const input = businessSettingsSchema.parse(req.body);

    res.status(200).json({ data: await this.service.update(input) });
  }
}
