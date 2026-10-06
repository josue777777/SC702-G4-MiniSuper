import type { Request, Response } from 'express';
import type { InventoryService } from '../services/inventory.service.js';
import { createInventoryCountSchema } from '../validators/inventory.validator.js';

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

  /** `POST /api/inventory/counts` — registrar conteo físico (HU-10). */
  async createCount(req: Request, res: Response): Promise<void> {
    const input = createInventoryCountSchema.parse(req.body);

    res.status(201).json({ data: await this.service.registerCount(input) });
  }
}
