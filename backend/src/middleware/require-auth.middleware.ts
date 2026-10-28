import type { NextFunction, Request, Response } from 'express';
import { hasPermission, type Permission } from '../auth/permissions.js';
import type { AuthService } from '../services/auth.service.js';
import type { SessionUserDto } from '../types/auth.js';
import { HttpError } from '../utils/http-error.js';
import { readSessionCookie } from '../utils/session-cookie.js';

/** Mensaje de la API mientras el usuario tiene una contraseña temporal. */
export const PASSWORD_CHANGE_REQUIRED = 'Debe cambiar su contraseña temporal antes de continuar.';

/**
 * Exige una sesión válida. Deja al usuario en `res.locals.user`; los
 * controllers usan ESE id y nunca uno enviado por el navegador.
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

/**
 * Con una contraseña temporal no se usa ningún módulo: solo «Mi perfil» para
 * cambiarla (esa ruta no lleva este middleware).
 */
export function requirePasswordChanged(_req: Request, res: Response, next: NextFunction): void {
  if (authenticatedUser(res).mustChangePassword) {
    throw HttpError.forbidden(PASSWORD_CHANGE_REQUIRED);
  }

  next();
}

/**
 * Exige un permiso del rol (`auth/permissions.ts`). Consultar (GET) pide
 * `read`; crear, modificar o desactivar pide `write`, que por omisión es el
 * mismo permiso. Va DESPUÉS de `createRequireAuth`.
 */
export function requirePermission(read: Permission, write: Permission = read) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const needed = req.method === 'GET' || req.method === 'HEAD' ? read : write;

    if (!hasPermission(authenticatedUser(res).role, needed)) {
      throw HttpError.forbidden('Su rol no tiene acceso a esta sección.');
    }

    next();
  };
}

/** Usuario autenticado por `createRequireAuth`. */
export function authenticatedUser(res: Response): SessionUserDto {
  return res.locals['user'] as SessionUserDto;
}

const PLATFORM_ONLY =
  'Esta sección es de un negocio. La plataforma no accede a los datos de los negocios.';

/**
 * Para las rutas de un negocio: exige que el usuario pertenezca a uno. Los
 * administradores de la plataforma no tienen negocio y no pasan (además de no
 * tener esos permisos): no ven los datos internos de sus clientes.
 */
export function requireBusiness(_req: Request, res: Response, next: NextFunction): void {
  businessIdOf(res);
  next();
}

/**
 * Negocio del usuario de la sesión. Es la ÚNICA fuente del `businessId` con el
 * que se filtra todo: nunca se toma de la URL ni del cuerpo de la petición.
 */
export function businessIdOf(res: Response): string {
  const { businessId } = authenticatedUser(res);

  if (businessId === null) {
    throw HttpError.forbidden(PLATFORM_ONLY);
  }

  return businessId;
}
