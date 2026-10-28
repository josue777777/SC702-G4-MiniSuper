import type { Request, Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import { HttpError } from '../utils/http-error.js';
import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
} from '../utils/session-cookie.js';
import { loginSchema } from '../validators/auth.validator.js';

/** Capa de controlador de la sesión (HU-11, HU-15). No hay registro público. */
export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly secureCookie: boolean,
  ) {}

  /** `POST /api/auth/login` — valida credenciales y abre la sesión. */
  async login(req: Request, res: Response): Promise<void> {
    const input = loginSchema.parse(req.body);
    const session = await this.service.login(input, req.ip ?? 'desconocido');

    setSessionCookie(res, session.token, this.secureCookie);
    res.status(200).json({ data: session.user });
  }

  /** `GET /api/auth/session` — usuario de la sesión actual (con rol y permisos), o 401. */
  async session(req: Request, res: Response): Promise<void> {
    const user = await this.service.resolveSession(readSessionCookie(req));

    if (user === null) {
      throw HttpError.unauthorized('No hay una sesión iniciada.');
    }

    res.status(200).json({ data: user });
  }

  /**
   * `POST /api/auth/logout` — cierra la sesión (HU-15): invalida los tokens en
   * el servidor y borra la cookie. Responde 204 aunque no hubiera sesión, para
   * que el navegador siempre pueda volver al login.
   */
  async logout(req: Request, res: Response): Promise<void> {
    await this.service.logout(readSessionCookie(req));

    clearSessionCookie(res, this.secureCookie);
    res.status(204).end();
  }
}
