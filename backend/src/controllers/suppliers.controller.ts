import type { Request, Response } from 'express';
import { businessIdOf } from '../middleware/require-auth.middleware.js';
import type { ForBusiness } from '../types/tenant.js';
import type { SuppliersService } from '../services/suppliers.service.js';
import { supplierIdParamSchema, supplierSchema } from '../validators/suppliers.validator.js';

/** Capa de controlador de proveedores (HU-21): HTTP ↔ service, recurso dentro de `data`. */
export class SuppliersController {
  /** El service del negocio de la sesión: cada petición trabaja solo con el suyo. */
  constructor(private readonly serviceFor: ForBusiness<SuppliersService>) {}

  /** `GET /api/suppliers` — proveedores con sus productos. */
  async list(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.serviceFor(businessIdOf(res)).listSuppliers() });
  }

  /** `POST /api/suppliers` — registrar proveedor (HU-21). */
  async create(req: Request, res: Response): Promise<void> {
    const input = supplierSchema.parse(req.body);

    res.status(201).json({ data: await this.serviceFor(businessIdOf(res)).createSupplier(input) });
  }

  /** `PATCH /api/suppliers/:id` — editar proveedor (HU-21). */
  async update(req: Request, res: Response): Promise<void> {
    const { id } = supplierIdParamSchema.parse(req.params);
    const input = supplierSchema.parse(req.body);

    res
      .status(200)
      .json({ data: await this.serviceFor(businessIdOf(res)).updateSupplier(id, input) });
  }
}
