import type { Request, Response } from 'express';
import { businessIdOf } from '../middleware/require-auth.middleware.js';
import type { ForBusiness } from '../types/tenant.js';
import type { CustomersService } from '../services/customers.service.js';
import { createCustomerSchema } from '../validators/customers.validator.js';

/** Capa de controlador del cliente básico para fiar (HU-18). */
export class CustomersController {
  /** El service del negocio de la sesión: cada petición trabaja solo con el suyo. */
  constructor(private readonly serviceFor: ForBusiness<CustomersService>) {}

  /** `GET /api/customers` — clientes activos con su saldo. */
  async list(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.serviceFor(businessIdOf(res)).listActiveCustomers() });
  }

  /** `POST /api/customers` — crea un cliente. */
  async create(req: Request, res: Response): Promise<void> {
    const input = createCustomerSchema.parse(req.body);

    res.status(201).json({ data: await this.serviceFor(businessIdOf(res)).createCustomer(input) });
  }
}
