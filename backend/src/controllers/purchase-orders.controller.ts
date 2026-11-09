import type { Request, Response } from 'express';
import { businessIdOf } from '../middleware/require-auth.middleware.js';
import type { ForBusiness } from '../types/tenant.js';
import type { PurchaseOrdersService } from '../services/purchase-orders.service.js';
import {
  createPurchaseOrderSchema,
  listPurchaseOrdersQuerySchema,
  purchaseOrderIdParamSchema,
  receiptInvoiceSchema,
  receiptParamsSchema,
  receiveOrderSchema,
} from '../validators/purchase-orders.validator.js';
import { declaredContentType } from '../utils/image.js';
import { invoiceFileName } from '../utils/invoice-file.js';

/** Capa de controlador de pedidos a proveedor (HU-22, HU-24) y sus entregas (HU-38). */
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

  /** `POST /api/purchase-orders/:id/receipts` — registrar una entrega (HU-38). */
  async receive(req: Request, res: Response): Promise<void> {
    const { id } = purchaseOrderIdParamSchema.parse(req.params);
    const input = receiveOrderSchema.parse(req.body);

    res
      .status(201)
      .json({ data: await this.serviceFor(businessIdOf(res)).receiveOrder(id, input) });
  }

  /** `POST /api/purchase-orders/:id/receipts/:receiptId/load` — cargar al inventario (HU-38). */
  async loadReceipt(req: Request, res: Response): Promise<void> {
    const { id, receiptId } = receiptParamsSchema.parse(req.params);

    res
      .status(200)
      .json({ data: await this.serviceFor(businessIdOf(res)).loadReceipt(id, receiptId) });
  }

  /** `PUT /api/purchase-orders/:id/receipts/:receiptId/invoice` — adjuntar la factura (HU-38). */
  async attachInvoice(req: Request, res: Response): Promise<void> {
    const { id, receiptId } = receiptParamsSchema.parse(req.params);
    const file = receiptInvoiceSchema.parse({
      mimeType: declaredContentType(req),
      name: invoiceFileName(req.headers['x-file-name']),
      data: req.body,
    });

    res.status(200).json({
      data: await this.serviceFor(businessIdOf(res)).attachReceiptInvoice(id, receiptId, file),
    });
  }

  /** `GET /api/purchase-orders/:id/receipts/:receiptId/invoice` — ver la factura (HU-38). */
  async getInvoice(req: Request, res: Response): Promise<void> {
    const { id, receiptId } = receiptParamsSchema.parse(req.params);
    const file = await this.serviceFor(businessIdOf(res)).getReceiptInvoice(id, receiptId);

    // Es un documento del negocio: no se guarda en cachés compartidas.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);
    res.type(file.mimeType).send(Buffer.from(file.data));
  }

  /** `POST /api/purchase-orders/:id/close` — dar por concluido (HU-38). */
  async close(req: Request, res: Response): Promise<void> {
    const { id } = purchaseOrderIdParamSchema.parse(req.params);

    res.status(200).json({ data: await this.serviceFor(businessIdOf(res)).closeOrder(id) });
  }
}
