import type { Request, Response } from 'express';
import { businessIdOf } from '../middleware/require-auth.middleware.js';
import type { KardexService } from '../services/kardex.service.js';
import type { ForBusiness } from '../types/tenant.js';
import {
  kardexEntrySchema,
  kardexExitSchema,
  kardexMovementsQuerySchema,
  kardexProductParamSchema,
  kardexSearchQuerySchema,
} from '../validators/kardex.validator.js';

/**
 * Controlador del Kardex (HU-31, HU-38): traduce HTTP ↔ service. Lecturas,
 * más el ingreso sin pedido y el egreso de un lote. El negocio sale SIEMPRE
 * de la sesión (`businessIdOf`), nunca de la petición.
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

  /** `GET /api/kardex/movements?page=&pageSize=` — vista general: todos los productos y el resumen de hoy. */
  async listRecentMovements(req: Request, res: Response): Promise<void> {
    const query = kardexMovementsQuerySchema.parse(req.query);

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      data: await this.serviceFor(businessIdOf(res)).listRecentMovements(query),
    });
  }

  /** `GET /api/kardex/products/:productId/lots` — lotes con unidades (para un egreso). */
  async listStockLots(req: Request, res: Response): Promise<void> {
    const { productId } = kardexProductParamSchema.parse(req.params);

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      data: await this.serviceFor(businessIdOf(res)).listStockLots(productId),
    });
  }

  /** `POST /api/kardex/products/:productId/entries` — ingreso sin pedido (compra directa). */
  async registerEntry(req: Request, res: Response): Promise<void> {
    const { productId } = kardexProductParamSchema.parse(req.params);
    const input = kardexEntrySchema.parse(req.body);

    res.status(201).json({
      data: await this.serviceFor(businessIdOf(res)).registerEntry(productId, input),
    });
  }

  /** `POST /api/kardex/products/:productId/exits` — egreso de un lote (no es venta). */
  async registerExit(req: Request, res: Response): Promise<void> {
    const { productId } = kardexProductParamSchema.parse(req.params);
    const input = kardexExitSchema.parse(req.body);

    res.status(201).json({
      data: await this.serviceFor(businessIdOf(res)).registerExit(productId, input),
    });
  }
}
