import { Router } from 'express';
import { CategoriesController } from '../controllers/categories.controller.js';
import { CategoriesRepository } from '../repositories/categories.repository.js';
import { CategoriesService } from '../services/categories.service.js';

/** Fábrica de rutas: permite montarlas con un repositorio falso en las pruebas. */
export function createCategoriesRouter(repository: CategoriesRepository): Router {
  const controller = new CategoriesController(new CategoriesService(repository));
  const router = Router();

  router.get('/', (req, res) => controller.list(req, res));
  router.post('/', (req, res) => controller.create(req, res));

  return router;
}

export const categoriesRouter = createCategoriesRouter(new CategoriesRepository());
