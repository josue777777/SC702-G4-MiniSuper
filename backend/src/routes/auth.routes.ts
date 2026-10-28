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

  router.post('/login', (req, res) => controller.login(req, res));
  router.get('/session', (req, res) => controller.session(req, res));
  router.post('/logout', (req, res) => controller.logout(req, res));

  return router;
}

/** Service compartido con `/api/profile`, `/api/users` y las rutas protegidas: todos usan la misma sesión. */
export const authService = new AuthService(new UsersRepository(), {
  sessionSecret,
  limiter: new LoginRateLimiter(),
});

export const authRouter = createAuthRouter(authService, env.CORS_ORIGIN, isProduction);
