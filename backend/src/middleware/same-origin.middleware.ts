import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/http-error.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defensa CSRF para las operaciones que cambian datos con sesión por cookie:
 * si el navegador declara un `Origin` distinto del frontend autorizado, se
 * rechaza. Se suma a `SameSite=Strict` de la cookie y a que la API solo acepta
 * JSON (una página ajena no puede enviarlo sin pasar por CORS).
 */
export function createSameOriginGuard(allowedOrigin: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;

    if (!SAFE_METHODS.has(req.method) && origin !== undefined && origin !== allowedOrigin) {
      throw HttpError.forbidden('Origen no permitido.');
    }

    next();
  };
}
