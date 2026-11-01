import { Router } from 'express';
import { appUrl, env } from '../config/env.js';
import { accountNotifier } from '../config/mail.js';
import { PasswordRecoveryController } from '../controllers/password-recovery.controller.js';
import { createSameOriginGuard } from '../middleware/same-origin.middleware.js';
import { PasswordResetRepository } from '../repositories/password-reset.repository.js';
import { PasswordRecoveryService } from '../services/password-recovery.service.js';
import { LoginRateLimiter } from '../utils/login-rate-limiter.js';

const ONE_HOUR = 60 * 60 * 1000;

/** Fábrica de rutas: permite montarlas con un service de prueba. */
export function createPasswordRecoveryRouter(
  service: PasswordRecoveryService,
  allowedOrigin: string,
): Router {
  const controller = new PasswordRecoveryController(service);
  const router = Router();

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(createSameOriginGuard(allowedOrigin));

  router.post('/forgot', (req, res) => controller.forgot(req, res));
  router.post('/reset', (req, res) => controller.reset(req, res));

  return router;
}

export const passwordRecoveryRouter = createPasswordRecoveryRouter(
  new PasswordRecoveryService(new PasswordResetRepository(), accountNotifier, {
    appUrl,
    // 3 enlaces por correo y 10 solicitudes por equipo, cada hora.
    emailLimiter: new LoginRateLimiter(3, ONE_HOUR),
    ipLimiter: new LoginRateLimiter(10, ONE_HOUR),
  }),
  env.CORS_ORIGIN,
);
