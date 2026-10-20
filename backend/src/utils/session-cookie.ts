import type { Request, Response } from 'express';
import { SESSION_TTL_SECONDS } from '../services/auth.service.js';

export const SESSION_COOKIE = 'ms_session';

/** Lee la cookie de sesión de la cabecera `Cookie` (sin dependencia de cookie-parser). */
export function readSessionCookie(req: Request): string | undefined {
  const header = req.headers.cookie;

  if (header === undefined) {
    return undefined;
  }

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');

    if (separator > 0 && part.slice(0, separator).trim() === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }

  return undefined;
}

/**
 * Guarda el token en una cookie `HttpOnly` (el JavaScript de la página no puede
 * leerla) y `SameSite=Strict` (el navegador no la envía en peticiones iniciadas
 * desde otro sitio: primera defensa contra CSRF).
 */
export function setSessionCookie(res: Response, token: string, secure: boolean): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

/** Borra la cookie de sesión (HU-15). Los atributos deben coincidir con los de `setSessionCookie`. */
export function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'strict', secure, path: '/' });
}
