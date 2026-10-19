import type { NextFunction, Request, Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { ProfileDto } from '../types/auth.js';
import { HttpError } from '../utils/http-error.js';
import { readSessionCookie } from '../utils/session-cookie.js';

/**
 * Exige una sesión válida. Deja al dueño en `res.locals.user`; los controllers
 * usan ESE id y nunca uno enviado por el navegador. Reutilizable por cualquier
 * ruta que HU-11 proteja después.
 */
export function createRequireAuth(authService: AuthService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = await authService.resolveSession(readSessionCookie(req));

    if (user === null) {
      throw HttpError.unauthorized('Inicie sesión para continuar.');
    }

    res.locals['user'] = user;
    next();
  };
}

/** Dueño autenticado por `createRequireAuth`. */
export function authenticatedUser(res: Response): ProfileDto {
  return res.locals['user'] as ProfileDto;
}
