import type { Request, Response } from 'express';
import { authenticatedUser, businessIdOf } from '../middleware/require-auth.middleware.js';
import type { PlatformService } from '../services/platform.service.js';
import {
  businessPlanSchema,
  createBusinessSchema,
  decideRequestSchema,
  idParamSchema,
  planRequestSchema,
  platformSettingsSchema,
  requestStatusQuerySchema,
} from '../validators/platform.validator.js';

/** Capa de controlador de la plataforma y de las solicitudes de ampliación. */
export class PlatformController {
  constructor(private readonly service: PlatformService) {}

  /** `GET /api/platform/public` — nombre del sistema (pantalla de login). */
  async getPublic(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.service.getPublic() });
  }

  async getSettings(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.service.getSettings() });
  }

  async updateSettings(req: Request, res: Response): Promise<void> {
    const input = platformSettingsSchema.parse(req.body);

    res.status(200).json({ data: await this.service.updateSettings(input) });
  }

  async listBusinesses(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.service.listBusinesses() });
  }

  /** `POST /api/platform/businesses` — devuelve la contraseña temporal del Encargado (una vez). */
  async createBusiness(req: Request, res: Response): Promise<void> {
    const input = createBusinessSchema.parse(req.body);

    res.status(201).json({ data: await this.service.createBusiness(input) });
  }

  async setPlan(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { extraUsers } = businessPlanSchema.parse(req.body);

    res.status(200).json({ data: await this.service.setPlan(id, extraUsers) });
  }

  async suspend(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);

    res.status(200).json({ data: await this.service.suspend(id) });
  }

  async activate(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);

    res.status(200).json({ data: await this.service.activate(id) });
  }

  /** `GET /api/platform/requests[?status=PENDING]` — la bandeja de solicitudes. */
  async listRequests(req: Request, res: Response): Promise<void> {
    const { status } = requestStatusQuerySchema.parse(req.query);

    res.status(200).json({ data: await this.service.listRequests(status) });
  }

  async approve(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { response } = decideRequestSchema.parse(req.body ?? {});

    res
      .status(200)
      .json({ data: await this.service.approve(id, authenticatedUser(res).id, response) });
  }

  async reject(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { response } = decideRequestSchema.parse(req.body ?? {});

    res
      .status(200)
      .json({ data: await this.service.reject(id, authenticatedUser(res).id, response) });
  }

  /** `GET /api/plan-requests` — las solicitudes del negocio del Encargado y el precio vigente. */
  async listOwnRequests(_req: Request, res: Response): Promise<void> {
    const [requests, settings] = await Promise.all([
      this.service.listOwnRequests(businessIdOf(res)),
      this.service.getSettings(),
    ]);

    res.status(200).json({ data: { requests, pricePerExtraUser: settings.pricePerExtraUser } });
  }

  /** `POST /api/plan-requests` — el Encargado pide más usuarios para su negocio. */
  async requestMoreUsers(req: Request, res: Response): Promise<void> {
    const input = planRequestSchema.parse(req.body);
    const user = authenticatedUser(res);

    res
      .status(201)
      .json({ data: await this.service.requestMoreUsers(businessIdOf(res), user.id, input) });
  }
}
