import type { Request, Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import { HttpError } from '../utils/http-error.js';
import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
} from '../utils/session-cookie.js';
import { loginSchema, setupSchema } from '../validators/auth.validator.js';

/** Capa de controlador de la cuenta única y la sesión (HU-12, HU-15; base de HU-11). */
export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly secureCookie: boolean,
  ) {}

  /** `GET /api/auth/setup-status` — ¿ya existe la cuenta del dueño? */
  async setupStatus(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.service.getSetupStatus() });
  }

  /** `POST /api/auth/setup` — crea la cuenta única (solo la primera vez). */
  async setup(req: Request, res: Response): Promise<void> {
    const input = setupSchema.parse(req.body);

    res.status(201).json({ data: await this.service.setupOwner(input) });
  }

  /** `POST /api/auth/login` — valida credenciales y abre la sesión. */
  async login(req: Request, res: Response): Promise<void> {
    const input = loginSchema.parse(req.body);
    const session = await this.service.login(input, req.ip ?? 'desconocido');

    setSessionCookie(res, session.token, this.secureCookie);
    res.status(200).json({ data: session.user });
  }

  /** `GET /api/auth/session` — dueño de la sesión actual, o 401. */
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
