import { Router } from 'express';
import { env, isProduction } from '../config/env.js';
import { PreferencesController } from '../controllers/preferences.controller.js';
import { ProfileController } from '../controllers/profile.controller.js';
import { createRequireAuth } from '../middleware/require-auth.middleware.js';
import { createSameOriginGuard } from '../middleware/same-origin.middleware.js';
import { PreferencesRepository } from '../repositories/preferences.repository.js';
import { UsersRepository } from '../repositories/users.repository.js';
import type { AuthService } from '../services/auth.service.js';
import { ProfileService } from '../services/profile.service.js';
import { authService } from './auth.routes.js';

/** Fábrica de rutas: permite montarlas con un repositorio y un service de prueba. */
export function createProfileRouter(
  repository: UsersRepository,
  auth: AuthService,
  allowedOrigin: string,
  secureCookie: boolean,
  preferences: PreferencesRepository = new PreferencesRepository(),
): Router {
  const controller = new ProfileController(new ProfileService(repository), auth, secureCookie);
  const preferencesController = new PreferencesController(preferences);
  const router = Router();

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(createSameOriginGuard(allowedOrigin));
  // Sin sesión válida no se llega a ningún handler: no existe perfil público.
  router.use(createRequireAuth(auth));

  router.get('/', (req, res) => controller.get(req, res));
  router.patch('/', (req, res) => controller.update(req, res));
  // Configuración › Apariencia: cada usuario, las suyas.
  router.get('/preferences', (req, res) => preferencesController.get(req, res));
  router.put('/preferences', (req, res) => preferencesController.update(req, res));

  return router;
}

export const profileRouter = createProfileRouter(
  new UsersRepository(),
  authService,
  env.CORS_ORIGIN,
  isProduction,
);
