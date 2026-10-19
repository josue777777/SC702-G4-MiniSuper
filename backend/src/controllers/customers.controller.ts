import type { Request, Response } from 'express';
import type { CustomersService } from '../services/customers.service.js';
import { createCustomerSchema } from '../validators/customers.validator.js';

/** Capa de controlador del cliente básico para fiar (HU-18). */
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  /** `GET /api/customers` — clientes activos con su saldo. */
  async list(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.service.listActiveCustomers() });
  }

  /** `POST /api/customers` — crea un cliente. */
  async create(req: Request, res: Response): Promise<void> {
    const input = createCustomerSchema.parse(req.body);

    res.status(201).json({ data: await this.service.createCustomer(input) });
  }
}
