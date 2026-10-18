import type { Request, Response } from 'express';
import type { PurchaseOrdersService } from '../services/purchase-orders.service.js';
import {
  createPurchaseOrderSchema,
  listPurchaseOrdersQuerySchema,
  purchaseOrderIdParamSchema,
} from '../validators/purchase-orders.validator.js';

/** Capa de controlador de pedidos a proveedor (HU-22, HU-24). */
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

  /** `GET /api/purchase-orders?supplierId=` — historial (HU-22). */
  async list(req: Request, res: Response): Promise<void> {
    const query = listPurchaseOrdersQuerySchema.parse(req.query);

    res.status(200).json({ data: await this.service.listOrders(query) });
  }

  /** `GET /api/purchase-orders/:id` — detalle del pedido (HU-22, HU-24). */
  async getById(req: Request, res: Response): Promise<void> {
    const { id } = purchaseOrderIdParamSchema.parse(req.params);

    res.status(200).json({ data: await this.service.getOrder(id) });
  }

  /** `POST /api/purchase-orders` — registrar pedido (HU-24). */
  async create(req: Request, res: Response): Promise<void> {
    const input = createPurchaseOrderSchema.parse(req.body);

    res.status(201).json({ data: await this.service.createOrder(input) });
  }
}
