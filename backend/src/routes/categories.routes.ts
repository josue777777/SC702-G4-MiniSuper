import { Router } from 'express';
import { CategoriesController } from '../controllers/categories.controller.js';
import { CategoriesRepository } from '../repositories/categories.repository.js';
import { CategoriesService } from '../services/categories.service.js';
import type { ForBusiness } from '../types/tenant.js';

/**
 * Fábrica de rutas: recibe cómo armar el repositorio de un negocio (en las
 * pruebas, uno falso). Cada petición usa el del negocio de su sesión.
 */
export function createCategoriesRouter(repositoryFor: ForBusiness<CategoriesRepository>): Router {
  const controller = new CategoriesController(
    (businessId) => new CategoriesService(repositoryFor(businessId)),
  );
  const router = Router();

  router.get('/', (req, res) => controller.list(req, res));
  router.post('/', (req, res) => controller.create(req, res));

  return router;
}

export const categoriesRouter = createCategoriesRouter(
  (businessId) => new CategoriesRepository(businessId),
);
