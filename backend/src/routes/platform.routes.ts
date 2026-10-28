import { Router } from 'express';
import { PlatformController } from '../controllers/platform.controller.js';
import { PlatformRepository } from '../repositories/platform.repository.js';
import { PlatformService } from '../services/platform.service.js';

/**
 * Rutas de la plataforma. `routes/index.ts` monta cada router con su
 * protección:
 *   - `publicRouter`: sin sesión, solo el nombre del sistema (login);
 *   - `adminRouter`: sesión + `platform.manage` (solo Administrador);
 *   - `requestsRouter`: sesión + negocio + `plan.request` (Encargado).
 */
export function createPlatformRouters(repository: PlatformRepository): {
  publicRouter: Router;
  adminRouter: Router;
  requestsRouter: Router;
} {
  const controller = new PlatformController(new PlatformService(repository));
  const publicRouter = Router();
  const adminRouter = Router();
  const requestsRouter = Router();

  publicRouter.get('/', (req, res) => controller.getPublic(req, res));

  // Las respuestas pueden traer la contraseña temporal de un Encargado: el navegador no las guarda.
  adminRouter.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  adminRouter.get('/settings', (req, res) => controller.getSettings(req, res));
  adminRouter.put('/settings', (req, res) => controller.updateSettings(req, res));
  adminRouter.get('/businesses', (req, res) => controller.listBusinesses(req, res));
  adminRouter.post('/businesses', (req, res) => controller.createBusiness(req, res));
  adminRouter.patch('/businesses/:id/plan', (req, res) => controller.setPlan(req, res));
  adminRouter.post('/businesses/:id/suspend', (req, res) => controller.suspend(req, res));
  adminRouter.post('/businesses/:id/activate', (req, res) => controller.activate(req, res));
  adminRouter.get('/requests', (req, res) => controller.listRequests(req, res));
  adminRouter.post('/requests/:id/approve', (req, res) => controller.approve(req, res));
  adminRouter.post('/requests/:id/reject', (req, res) => controller.reject(req, res));

  requestsRouter.get('/', (req, res) => controller.listOwnRequests(req, res));
  requestsRouter.post('/', (req, res) => controller.requestMoreUsers(req, res));

  return { publicRouter, adminRouter, requestsRouter };
}

export const {
  publicRouter: publicPlatformRouter,
  adminRouter: platformAdminRouter,
  requestsRouter: planRequestsRouter,
} = createPlatformRouters(new PlatformRepository());
