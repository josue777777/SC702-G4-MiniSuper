import type { Request, Response } from 'express';
import { authenticatedUser } from '../middleware/require-auth.middleware.js';
import type { UsersService } from '../services/users.service.js';
import {
  createUserSchema,
  updateUserSchema,
  userIdParamSchema,
} from '../validators/users.validator.js';

/** Capa de controlador de Configuración › Usuarios. Solo para el Administrador. */
export class UsersController {
  constructor(private readonly service: UsersService) {}

  /** `GET /api/users` — usuarios con su rol y estado. */
  async list(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.service.list() });
  }

  /** `POST /api/users` — crea un usuario y devuelve su contraseña temporal (una sola vez). */
  async create(req: Request, res: Response): Promise<void> {
    const input = createUserSchema.parse(req.body);

    res.status(201).json({ data: await this.service.create(input) });
  }

  /** `PATCH /api/users/:id` — nombre, correo y/o rol. */
  async update(req: Request, res: Response): Promise<void> {
    const { id } = userIdParamSchema.parse(req.params);
    const input = updateUserSchema.parse(req.body);

    res.status(200).json({ data: await this.service.update(id, input, authenticatedUser(res).id) });
  }

  /** `POST /api/users/:id/deactivate` — no se borra: deja de poder iniciar sesión. */
  async deactivate(req: Request, res: Response): Promise<void> {
    const { id } = userIdParamSchema.parse(req.params);

    res.status(200).json({ data: await this.service.deactivate(id, authenticatedUser(res).id) });
  }

  /** `POST /api/users/:id/activate` — vuelve a darle acceso. */
  async activate(req: Request, res: Response): Promise<void> {
    const { id } = userIdParamSchema.parse(req.params);

    res.status(200).json({ data: await this.service.activate(id) });
  }

  /** `POST /api/users/:id/reset-password` — contraseña temporal nueva (una sola vez). */
  async resetPassword(req: Request, res: Response): Promise<void> {
    const { id } = userIdParamSchema.parse(req.params);

    res.status(200).json({ data: await this.service.resetPassword(id, authenticatedUser(res).id) });
  }
}
