import { Router } from 'express';
import { SuppliersController } from '../controllers/suppliers.controller.js';
import { SuppliersRepository } from '../repositories/suppliers.repository.js';
import { SuppliersService } from '../services/suppliers.service.js';
import type { ForBusiness } from '../types/tenant.js';

/** Fábrica de rutas de proveedores: permite montarlas con un repositorio falso. */
export function createSuppliersRouter(repositoryFor: ForBusiness<SuppliersRepository>): Router {
  const controller = new SuppliersController(
    (businessId) => new SuppliersService(repositoryFor(businessId)),
  );
  const router = Router();

  router.get('/', (req, res) => controller.list(req, res));
  router.post('/', (req, res) => controller.create(req, res));
  /** Editar (HU-21). No hay baja: HU-21 no la pide. */
  router.patch('/:id', (req, res) => controller.update(req, res));

  return router;
}

export const suppliersRouter = createSuppliersRouter(
  (businessId) => new SuppliersRepository(businessId),
);
