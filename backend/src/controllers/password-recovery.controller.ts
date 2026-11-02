import type { Request, Response } from 'express';
import type { PasswordRecoveryService } from '../services/password-recovery.service.js';
import { forgotPasswordSchema, resetPasswordSchema } from '../validators/auth.validator.js';

/** Recuperación de contraseña por correo (HU-13). Rutas públicas: sin sesión. */
export class PasswordRecoveryController {
  constructor(private readonly service: PasswordRecoveryService) {}

  /**
   * `POST /api/auth/password/forgot` — pide el enlace. Responde 202 siempre
   * (exista o no la cuenta): el frontend muestra un mensaje genérico.
   */
  async forgot(req: Request, res: Response): Promise<void> {
    const { email } = forgotPasswordSchema.parse(req.body);

    await this.service.requestReset(email, req.ip ?? 'desconocido');
    res.status(202).end();
  }

  /** `POST /api/auth/password/reset` — contraseña nueva con el enlace del correo. */
  async reset(req: Request, res: Response): Promise<void> {
    const { token, password } = resetPasswordSchema.parse(req.body);

    await this.service.resetPassword(token, password);
    res.status(204).end();
  }
}
