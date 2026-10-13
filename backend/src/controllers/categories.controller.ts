import type { Request, Response } from 'express';
import type { CategoriesService } from '../services/categories.service.js';
import { createCategorySchema } from '../validators/categories.validator.js';

/** Capa de controlador del módulo de categorías (HU-04). */
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  /** `GET /api/categories` — categorías existentes. */
  async list(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.service.listCategories() });
  }

  /** `POST /api/categories` — crear categoría. */
  async create(req: Request, res: Response): Promise<void> {
    const input = createCategorySchema.parse(req.body);

    res.status(201).json({ data: await this.service.createCategory(input) });
  }
}
