import type { Request, Response } from 'express';
import { businessIdOf } from '../middleware/require-auth.middleware.js';
import type { KardexService } from '../services/kardex.service.js';
import type { ForBusiness } from '../types/tenant.js';
import {
  kardexMovementsQuerySchema,
  kardexProductParamSchema,
  kardexSearchQuerySchema,
} from '../validators/kardex.validator.js';

/**
 * Controlador del Kardex (HU-31): traduce HTTP ↔ service. Solo hay lecturas. El
 * negocio sale SIEMPRE de la sesión (`businessIdOf`), nunca de la petición.
 */
export class KardexController {
  constructor(private readonly serviceFor: ForBusiness<KardexService>) {}

  /** `GET /api/kardex/products?search=` — productos para elegir (incluye desactivados). */
  async searchProducts(req: Request, res: Response): Promise<void> {
    const { search } = kardexSearchQuerySchema.parse(req.query);

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ data: await this.serviceFor(businessIdOf(res)).searchProducts(search) });
  }

  /** `GET /api/kardex/products/:productId` — ficha del producto. */
  async getProduct(req: Request, res: Response): Promise<void> {
    const { productId } = kardexProductParamSchema.parse(req.params);

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ data: await this.serviceFor(businessIdOf(res)).getProduct(productId) });
  }

  /** `GET /api/kardex/products/:productId/movements?page=&pageSize=` — historial paginado. */
  async listMovements(req: Request, res: Response): Promise<void> {
    const { productId } = kardexProductParamSchema.parse(req.params);
    const query = kardexMovementsQuerySchema.parse(req.query);

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      data: await this.serviceFor(businessIdOf(res)).listMovements(productId, query),
    });
  }
}
