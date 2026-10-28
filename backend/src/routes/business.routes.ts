import { Router } from 'express';
import { BusinessController } from '../controllers/business.controller.js';
import { requirePermission } from '../middleware/require-auth.middleware.js';
import { BusinessRepository } from '../repositories/business.repository.js';
import { UsersRepository } from '../repositories/users.repository.js';
import { BusinessService } from '../services/business.service.js';
import { imageBodyParser } from '../utils/image.js';
import type { ForBusiness } from '../types/tenant.js';
import { MAX_LOGO_BYTES } from '../validators/business.validator.js';

const logoBody = imageBodyParser(MAX_LOGO_BYTES, 'El logo supera el máximo de 1 MB.');

/**
 * Configuración › General del negocio de la sesión (`routes/index.ts` lo monta
 * detrás de la sesión y de `requireBusiness`):
 *   - leer: cualquier usuario del negocio;
 *   - datos y logo: `business.edit` (Encargado).
 */
export function createBusinessRouter(
  repositoryFor: ForBusiness<BusinessRepository>,
  users: Pick<UsersRepository, 'countUsedSeats'>,
): Router {
  const controller = new BusinessController(
    (businessId) => new BusinessService(repositoryFor(businessId), users),
  );
  const router = Router();
  const canEdit = requirePermission('business.edit');

  router.get('/', (req, res) => controller.get(req, res));
  router.put('/', canEdit, (req, res) => controller.update(req, res));
  router.get('/logo', (req, res) => controller.getLogo(req, res));
  router.put('/logo', canEdit, logoBody, (req, res) => controller.setLogo(req, res));
  router.delete('/logo', canEdit, (req, res) => controller.removeLogo(req, res));

  return router;
}

export const businessRouter = createBusinessRouter(
  (businessId) => new BusinessRepository(businessId),
  new UsersRepository(),
);
