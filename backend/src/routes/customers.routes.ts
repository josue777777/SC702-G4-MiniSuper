import { Router } from 'express';
import { CustomersController } from '../controllers/customers.controller.js';
import { CustomersRepository } from '../repositories/customers.repository.js';
import { CustomersService } from '../services/customers.service.js';
import type { ForBusiness } from '../types/tenant.js';

/** Fábrica de rutas: permite montarlas con un repositorio falso en las pruebas. */
export function createCustomersRouter(repositoryFor: ForBusiness<CustomersRepository>): Router {
  const controller = new CustomersController(
    (businessId) => new CustomersService(repositoryFor(businessId)),
  );
  const router = Router();

  router.get('/', (req, res) => controller.list(req, res));
  router.post('/', (req, res) => controller.create(req, res));

  return router;
}

export const customersRouter = createCustomersRouter(
  (businessId) => new CustomersRepository(businessId),
);
