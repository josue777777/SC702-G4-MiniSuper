import type { Request, Response } from 'express';
import { authenticatedUser } from '../middleware/require-auth.middleware.js';
import type { AuthService } from '../services/auth.service.js';
import type { ProfileService } from '../services/profile.service.js';
import { setSessionCookie } from '../utils/session-cookie.js';
import { updateProfileSchema } from '../validators/auth.validator.js';

/** Capa de controlador del perfil del dueño (HU-14). Todas las rutas exigen sesión. */
export class ProfileController {
  constructor(
    private readonly service: ProfileService,
    private readonly authService: AuthService,
    private readonly secureCookie: boolean,
  ) {}

  /** `GET /api/profile` — datos actuales (nunca la contraseña). */
  async get(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.service.getProfile(authenticatedUser(res).id) });
  }

  /** `PATCH /api/profile` — nombre, correo y/o contraseña. */
  async update(req: Request, res: Response): Promise<void> {
    const input = updateProfileSchema.parse(req.body);
    const user = authenticatedUser(res);
    const result = await this.service.updateProfile(user.id, input);

    // Cambiar la contraseña invalida los tokens anteriores: se renueva el de esta sesión.
    if (result.passwordHash !== undefined) {
      setSessionCookie(
        res,
        this.authService.issueToken({ id: user.id, passwordHash: result.passwordHash }),
        this.secureCookie,
      );
    }

    res.status(200).json({ data: result.profile });
  }
}
