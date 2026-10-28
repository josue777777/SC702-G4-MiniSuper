import type { Request, Response } from 'express';
import { businessIdOf } from '../middleware/require-auth.middleware.js';
import type { CategoriesService } from '../services/categories.service.js';
import type { ForBusiness } from '../types/tenant.js';
import { createCategorySchema } from '../validators/categories.validator.js';

/** Capa de controlador del módulo de categorías (HU-04). */
export class CategoriesController {
  /** El service del negocio de la sesión (nunca de otro). */
  constructor(private readonly serviceFor: ForBusiness<CategoriesService>) {}

  /** `GET /api/categories` — categorías existentes. */
  async list(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.serviceFor(businessIdOf(res)).listCategories() });
  }

  /** `POST /api/categories` — crear categoría. */
  async create(req: Request, res: Response): Promise<void> {
    const input = createCategorySchema.parse(req.body);

    res.status(201).json({ data: await this.serviceFor(businessIdOf(res)).createCategory(input) });
  }
}
