import type { Request, Response } from 'express';
import { businessIdOf } from '../middleware/require-auth.middleware.js';
import type { BusinessService } from '../services/business.service.js';
import type { ForBusiness } from '../types/tenant.js';
import { declaredContentType } from '../utils/image.js';
import { businessLogoSchema, businessSettingsSchema } from '../validators/business.validator.js';
import { labelDesignSchema } from '../validators/label-design.validator.js';

/** Capa de controlador de Configuración › General (el negocio de la sesión). */
export class BusinessController {
  constructor(private readonly serviceFor: ForBusiness<BusinessService>) {}

  /** `GET /api/business` — datos, logo y plan del propio negocio. */
  async get(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.serviceFor(businessIdOf(res)).get() });
  }

  /** `PUT /api/business` — datos del negocio (Encargado). */
  async update(req: Request, res: Response): Promise<void> {
    const input = businessSettingsSchema.parse(req.body);

    res.status(200).json({ data: await this.serviceFor(businessIdOf(res)).update(input) });
  }

  /**
   * `GET /api/business/logo` — los bytes del logo del propio negocio. Su URL
   * cambia con cada logo nuevo (`?v=`), así que se puede guardar en caché.
   */
  async getLogo(_req: Request, res: Response): Promise<void> {
    const logo = await this.serviceFor(businessIdOf(res)).getLogo();

    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.type(logo.mimeType).send(Buffer.from(logo.data));
  }

  /** `PUT /api/business/logo` — subir o reemplazar el logo. */
  async setLogo(req: Request, res: Response): Promise<void> {
    const logo = businessLogoSchema.parse({ mimeType: declaredContentType(req), data: req.body });

    res.status(200).json({ data: await this.serviceFor(businessIdOf(res)).setLogo(logo) });
  }

  /** `GET /api/business/label-design` — diseño de la etiqueta de productos (HU-07). */
  async getLabelDesign(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.serviceFor(businessIdOf(res)).getLabelDesign() });
  }

  /** `PUT /api/business/label-design` — guardar el diseño (Encargado). */
  async updateLabelDesign(req: Request, res: Response): Promise<void> {
    const design = labelDesignSchema.parse(req.body);

    res
      .status(200)
      .json({ data: await this.serviceFor(businessIdOf(res)).saveLabelDesign(design) });
  }

  /** `DELETE /api/business/logo` — quitar el logo. */
  async removeLogo(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.serviceFor(businessIdOf(res)).removeLogo() });
  }
}
