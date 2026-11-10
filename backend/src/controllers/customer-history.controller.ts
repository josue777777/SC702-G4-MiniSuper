/** Controlador HTTP del historial de compras del cliente (HU-36). */
import type { Request, Response } from 'express';
import { businessIdOf } from '../middleware/require-auth.middleware.js';
import type { CustomerHistoryService } from '../services/customer-history.service.js';
import type { ForBusiness } from '../types/tenant.js';
import { customerIdParamSchema } from '../validators/credit.validator.js';
import { customerPurchaseHistoryQuerySchema } from '../validators/customers.validator.js';

/** Controlador del historial de compras del cliente (HU-36). */
export class CustomerHistoryController {
  constructor(private readonly serviceFor: ForBusiness<CustomerHistoryService>) {}

  /** `GET /api/customers/:id/purchases` — historial completo paginado. */
  async purchases(req: Request, res: Response): Promise<void> {
    const { id } = customerIdParamSchema.parse(req.params);
    const query = customerPurchaseHistoryQuerySchema.parse(req.query);

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      data: await this.serviceFor(businessIdOf(res)).getPurchases(id, query.page, query.pageSize),
    });
  }
}
