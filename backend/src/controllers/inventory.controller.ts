import type { Request, Response } from 'express';
import type { InventoryService } from '../services/inventory.service.js';
import {
  createInventoryCountSchema,
  inventoryProductIdParamSchema,
  updateExpirationDateSchema,
  updateMinStockSchema,
} from '../validators/inventory.validator.js';

/**
 * Capa de controlador del módulo de inventario (HU-10).
 *
 * Traduce HTTP ↔ service: valida la entrada con Zod, llama al service y elige
 * el status code. El recurso viaja dentro de `data`, igual que en productos.
 */
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  /** `GET /api/inventory/counts` — historial de conteos (solo lectura). */
  async listCounts(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.service.listCounts() });
  }

  /** `GET /api/inventory/low-stock` — alertas de stock bajo (HU-08). */
  async listLowStock(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.service.listLowStockAlerts() });
  }

  /** `POST /api/inventory/counts` — registrar conteo físico (HU-10). */
  async createCount(req: Request, res: Response): Promise<void> {
    const input = createInventoryCountSchema.parse(req.body);

    res.status(201).json({ data: await this.service.registerCount(input) });
  }

  /** `GET /api/inventory/products` — mínimo y vencimiento por producto (HU-08, HU-09). */
  async listProductSettings(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.service.listProductSettings() });
  }

  /** `PATCH /api/inventory/products/:id/min-stock` — definir el mínimo (HU-08). */
  async updateMinStock(req: Request, res: Response): Promise<void> {
    const { id } = inventoryProductIdParamSchema.parse(req.params);
    const input = updateMinStockSchema.parse(req.body);

    res.status(200).json({ data: await this.service.updateMinStock(id, input) });
  }

  /** `PATCH /api/inventory/products/:id/expiration-date` — fecha de vencimiento (HU-09). */
  async updateExpirationDate(req: Request, res: Response): Promise<void> {
    const { id } = inventoryProductIdParamSchema.parse(req.params);
    const input = updateExpirationDateSchema.parse(req.body);

    res.status(200).json({ data: await this.service.updateExpirationDate(id, input) });
  }

  /** `GET /api/inventory/expirations` — vencidos y próximos a vencer (HU-09). */
  async listExpirations(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.service.listExpirations() });
  }
}
