import { Router } from 'express';
import { BusinessController } from '../controllers/business.controller.js';
import { requirePermission } from '../middleware/require-auth.middleware.js';
import { BusinessRepository } from '../repositories/business.repository.js';
import { BusinessService } from '../services/business.service.js';

/**
 * Datos del negocio. `routes/index.ts` monta `publicRouter` sin sesión (solo
 * el nombre) y `router` detrás de la sesión: leer lo puede cualquier rol,
 * modificar exige el permiso `settings` (solo Administrador).
 */
export function createBusinessRouters(repository: BusinessRepository): {
  router: Router;
  publicRouter: Router;
} {
  const controller = new BusinessController(new BusinessService(repository));
  const router = Router();
  const publicRouter = Router();

  router.get('/', (req, res) => controller.get(req, res));
  router.put('/', requirePermission('settings'), (req, res) => controller.update(req, res));

  publicRouter.get('/', (req, res) => controller.getPublic(req, res));

  return { router, publicRouter };
}

export const { router: businessRouter, publicRouter: publicBusinessRouter } = createBusinessRouters(
  new BusinessRepository(),
);
