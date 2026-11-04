import type { NextFunction, Request, Response } from 'express';
import type { Role } from '../auth/permissions.js';
import { permissionsOf } from '../auth/permissions.js';
import type { SessionUserDto } from '../types/auth.js';

/** Negocio con el que trabajan las pruebas de rutas. */
export const TEST_BUSINESS_ID = '0b000000-0000-4000-8000-000000000001';

/**
 * Para las pruebas de rutas montadas sin login: deja en `res.locals.user` lo
 * mismo que dejaría `createRequireAuth` con un usuario de ese negocio.
 */
export function fakeSession(businessId = TEST_BUSINESS_ID, role: Role = 'ENCARGADO') {
  const user: SessionUserDto = {
    id: '0a000000-0000-4000-8000-000000000001',
    name: 'Encargada de prueba',
    email: 'encargada@correo.cr',
    role,
    businessId,
    permissions: permissionsOf(role),
    mustChangePassword: false,
  };

  return (_req: Request, res: Response, next: NextFunction): void => {
    res.locals['user'] = user;
    next();
  };
}
