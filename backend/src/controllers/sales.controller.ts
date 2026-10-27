import type { Request, Response } from 'express';
import type { SalesService } from '../services/sales.service.js';
import {
  createSaleSchema,
  lookupQuerySchema,
  saleAdjustmentSchema,
  saleIdParamSchema,
  saleListQuerySchema,
} from '../validators/sales.validator.js';

/** Capa de controlador de ventas (HU-16, HU-17, HU-18). */
export class SalesController {
  constructor(private readonly service: SalesService) {}

  /** `GET /api/sales/lookup?code=` — producto vendible por código o código de barras. */
  async lookup(req: Request, res: Response): Promise<void> {
    const { code } = lookupQuerySchema.parse(req.query);

    res.status(200).json({ data: await this.service.lookupProduct(code) });
  }

  /** `POST /api/sales` — confirma la venta (201) o devuelve la ya registrada con esa llave (200). */
  async create(req: Request, res: Response): Promise<void> {
    const input = createSaleSchema.parse(req.body);
    const { sale, created } = await this.service.createSale(input);

    res.status(created ? 201 : 200).json({ data: sale });
  }

  /** `GET /api/sales[?paymentMethod=CASH|CARD|CREDIT]` — historial mínimo. */
  async list(req: Request, res: Response): Promise<void> {
    const filter = saleListQuerySchema.parse(req.query);

    res.status(200).json({ data: await this.service.listSales(filter) });
  }

  /** `GET /api/sales/daily-summary` — totales de hoy en la zona del negocio (HU-37). */
  async dailySummary(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.service.getDailySummary() });
  }

  /** `POST /api/sales/:id/adjustments` — devolución parcial o anulación (HU-35). */
  async adjust(req: Request, res: Response): Promise<void> {
    const { id } = saleIdParamSchema.parse(req.params);
    const input = saleAdjustmentSchema.parse(req.body);

    res.status(200).json({ data: await this.service.adjustSale(id, input) });
  }

  /** `GET /api/sales/:id` — una venta con sus líneas (base del comprobante, HU-34). */
  async get(req: Request, res: Response): Promise<void> {
    const { id } = saleIdParamSchema.parse(req.params);

    res.status(200).json({ data: await this.service.getSale(id) });
  }
}
