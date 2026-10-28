import type { Request, Response } from 'express';
import { authenticatedUser } from '../middleware/require-auth.middleware.js';
import type { PreferencesRepository } from '../repositories/preferences.repository.js';
import { preferencesSchema } from '../validators/preferences.validator.js';

/**
 * Configuración › Apariencia. Cada usuario lee y cambia SOLO las suyas: el id
 * sale de la sesión, nunca del navegador. No hace falta un service: no hay
 * reglas de negocio más allá de validar las opciones.
 */
export class PreferencesController {
  constructor(private readonly repository: PreferencesRepository) {}

  /** `GET /api/profile/preferences` */
  async get(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.repository.get(authenticatedUser(res).id) });
  }

  /** `PUT /api/profile/preferences` */
  async update(req: Request, res: Response): Promise<void> {
    const input = preferencesSchema.parse(req.body);

    res.status(200).json({ data: await this.repository.save(authenticatedUser(res).id, input) });
  }
}
