import type { Request, Response } from 'express';
import { authenticatedUser, businessIdOf } from '../middleware/require-auth.middleware.js';
import type { CreditService } from '../services/credit.service.js';
import type { ForBusiness } from '../types/tenant.js';
import {
  customerIdParamSchema,
  paymentsQuerySchema,
  registerPaymentSchema,
} from '../validators/credit.validator.js';

/**
 * Controlador de las cuentas por cobrar y los abonos (HU-19). El negocio y el
 * usuario salen SIEMPRE de la sesión, nunca de la petición.
 */
export class CreditController {
  constructor(private readonly serviceFor: ForBusiness<CreditService>) {}

  /** `GET /api/customers/:id/credit` — deuda actual y fiados del cliente. */
  async getCredit(req: Request, res: Response): Promise<void> {
    const { id } = customerIdParamSchema.parse(req.params);

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ data: await this.serviceFor(businessIdOf(res)).getCredit(id) });
  }

  /** `GET /api/customers/:id/payments?page=&pageSize=` — una página del historial de abonos. */
  async listPayments(req: Request, res: Response): Promise<void> {
    const { id } = customerIdParamSchema.parse(req.params);
    const query = paymentsQuerySchema.parse(req.query);

    res.setHeader('Cache-Control', 'no-store');
    res
      .status(200)
      .json({ data: await this.serviceFor(businessIdOf(res)).listPayments(id, query) });
  }

  /**
   * `POST /api/customers/:id/payments` — registra un abono. `201` si se guardó;
   * `200` si la misma llave ya estaba registrada con los mismos datos (reintento).
   */
  async registerPayment(req: Request, res: Response): Promise<void> {
    const { id } = customerIdParamSchema.parse(req.params);
    const input = registerPaymentSchema.parse(req.body);
    const result = await this.serviceFor(businessIdOf(res)).registerPayment(
      id,
      input,
      authenticatedUser(res).id,
    );

    res.status(result.replayed ? 200 : 201).json({ data: result });
  }
}
