import type { Request, Response } from 'express';
import type { BusinessService } from '../services/business.service.js';
import { declaredContentType } from '../utils/image.js';
import {
  businessLogoSchema,
  businessPlanSchema,
  businessSettingsSchema,
} from '../validators/business.validator.js';

/** Capa de controlador de Configuración › General (datos, logo y plan del negocio). */
export class BusinessController {
  constructor(private readonly service: BusinessService) {}

  /** `GET /api/business` — datos completos y plan (con sesión). */
  async get(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.service.get() });
  }

  /** `GET /api/business/public` — nombre y logo, para la pantalla de login. */
  async getPublic(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.service.getPublic() });
  }

  /** `PUT /api/business` — datos del negocio (Administrador y Encargado). */
  async update(req: Request, res: Response): Promise<void> {
    const input = businessSettingsSchema.parse(req.body);

    res.status(200).json({ data: await this.service.update(input) });
  }

  /** `PUT /api/business/plan` — límite de usuarios (solo Administrador). */
  async updatePlan(req: Request, res: Response): Promise<void> {
    const input = businessPlanSchema.parse(req.body);

    res.status(200).json({ data: await this.service.updatePlan(input) });
  }

  /**
   * `GET /api/business/public/logo` — los bytes del logo. Es público (se ve en
   * el login) y su URL cambia con cada logo nuevo (`?v=`), así que se puede
   * guardar en caché.
   */
  async getLogo(_req: Request, res: Response): Promise<void> {
    const logo = await this.service.getLogo();

    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type(logo.mimeType).send(Buffer.from(logo.data));
  }

  /** `PUT /api/business/logo` — subir o reemplazar el logo. */
  async setLogo(req: Request, res: Response): Promise<void> {
    const logo = businessLogoSchema.parse({ mimeType: declaredContentType(req), data: req.body });

    res.status(200).json({ data: await this.service.setLogo(logo) });
  }

  /** `DELETE /api/business/logo` — quitar el logo. */
  async removeLogo(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.service.removeLogo() });
  }
}
