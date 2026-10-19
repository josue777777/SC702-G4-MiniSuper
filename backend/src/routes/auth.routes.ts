import { Router } from 'express';
import { env, isProduction, sessionSecret } from '../config/env.js';
import { AuthController } from '../controllers/auth.controller.js';
import { createSameOriginGuard } from '../middleware/same-origin.middleware.js';
import { UsersRepository } from '../repositories/users.repository.js';
import { AuthService } from '../services/auth.service.js';
import { LoginRateLimiter } from '../utils/login-rate-limiter.js';

/** Fábrica de rutas: permite montarlas con un service de prueba. */
export function createAuthRouter(
  service: AuthService,
  allowedOrigin: string,
  secureCookie: boolean,
): Router {
  const controller = new AuthController(service, secureCookie);
  const router = Router();

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(createSameOriginGuard(allowedOrigin));

  router.get('/setup-status', (req, res) => controller.setupStatus(req, res));
  router.post('/setup', (req, res) => controller.setup(req, res));
  router.post('/login', (req, res) => controller.login(req, res));
  router.get('/session', (req, res) => controller.session(req, res));

  return router;
}

/** Service compartido con `/api/profile`: ambos usan la misma sesión. */
export const authService = new AuthService(new UsersRepository(), {
  sessionSecret,
  ...(env.SETUP_TOKEN === undefined ? {} : { setupToken: env.SETUP_TOKEN }),
  requireSetupToken: isProduction,
  limiter: new LoginRateLimiter(),
});

export const authRouter = createAuthRouter(authService, env.CORS_ORIGIN, isProduction);
