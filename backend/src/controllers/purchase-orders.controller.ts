import type { Request, Response } from 'express';
import { businessIdOf } from '../middleware/require-auth.middleware.js';
import type { ForBusiness } from '../types/tenant.js';
import type { PurchaseOrdersService } from '../services/purchase-orders.service.js';
import {
  createPurchaseOrderSchema,
  listPurchaseOrdersQuerySchema,
  purchaseOrderIdParamSchema,
} from '../validators/purchase-orders.validator.js';

/** Capa de controlador de pedidos a proveedor (HU-22, HU-24). */
export class PurchaseOrdersController {
  /** El service del negocio de la sesión: cada petición trabaja solo con el suyo. */
  constructor(private readonly serviceFor: ForBusiness<PurchaseOrdersService>) {}

  /** `GET /api/purchase-orders?supplierId=` — historial (HU-22). */
  async list(req: Request, res: Response): Promise<void> {
    const query = listPurchaseOrdersQuerySchema.parse(req.query);

    res.status(200).json({ data: await this.serviceFor(businessIdOf(res)).listOrders(query) });
  }

  /** `GET /api/purchase-orders/:id` — detalle del pedido (HU-22, HU-24). */
  async getById(req: Request, res: Response): Promise<void> {
    const { id } = purchaseOrderIdParamSchema.parse(req.params);

    res.status(200).json({ data: await this.serviceFor(businessIdOf(res)).getOrder(id) });
  }

  /** `POST /api/purchase-orders` — registrar pedido (HU-24). */
  async create(req: Request, res: Response): Promise<void> {
    const input = createPurchaseOrderSchema.parse(req.body);

    res.status(201).json({ data: await this.serviceFor(businessIdOf(res)).createOrder(input) });
  }
}
