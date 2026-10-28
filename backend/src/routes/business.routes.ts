import { Router } from 'express';
import { BusinessController } from '../controllers/business.controller.js';
import { requirePermission } from '../middleware/require-auth.middleware.js';
import { BusinessRepository } from '../repositories/business.repository.js';
import { UsersRepository } from '../repositories/users.repository.js';
import { BusinessService } from '../services/business.service.js';
import { imageBodyParser } from '../utils/image.js';
import { MAX_LOGO_BYTES } from '../validators/business.validator.js';

const logoBody = imageBodyParser(MAX_LOGO_BYTES, 'El logo supera el máximo de 1 MB.');

/**
 * Datos del negocio. `routes/index.ts` monta `publicRouter` sin sesión (nombre
 * y logo) y `router` detrás de la sesión:
 *   - leer: cualquier rol;
 *   - datos y logo: `business.edit` (Administrador y Encargado);
 *   - plan: `plan.manage` (solo Administrador).
 */
export function createBusinessRouters(
  repository: BusinessRepository,
  users: Pick<UsersRepository, 'countUsedSeats'>,
): { router: Router; publicRouter: Router } {
  const controller = new BusinessController(new BusinessService(repository, users));
  const router = Router();
  const publicRouter = Router();
  const canEdit = requirePermission('business.edit');

  router.get('/', (req, res) => controller.get(req, res));
  router.put('/', canEdit, (req, res) => controller.update(req, res));
  router.put('/logo', canEdit, logoBody, (req, res) => controller.setLogo(req, res));
  router.delete('/logo', canEdit, (req, res) => controller.removeLogo(req, res));
  router.put('/plan', requirePermission('plan.manage'), (req, res) =>
    controller.updatePlan(req, res),
  );

  publicRouter.get('/', (req, res) => controller.getPublic(req, res));
  publicRouter.get('/logo', (req, res) => controller.getLogo(req, res));

  return { router, publicRouter };
}

export const { router: businessRouter, publicRouter: publicBusinessRouter } = createBusinessRouters(
  new BusinessRepository(),
  new UsersRepository(),
);
