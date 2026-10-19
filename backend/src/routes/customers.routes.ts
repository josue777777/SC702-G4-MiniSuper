import { Router } from 'express';
import { CustomersController } from '../controllers/customers.controller.js';
import { CustomersRepository } from '../repositories/customers.repository.js';
import { CustomersService } from '../services/customers.service.js';

/** Fábrica de rutas: permite montarlas con un repositorio falso en las pruebas. */
export function createCustomersRouter(repository: CustomersRepository): Router {
  const controller = new CustomersController(new CustomersService(repository));
  const router = Router();

  router.get('/', (req, res) => controller.list(req, res));
  router.post('/', (req, res) => controller.create(req, res));

  return router;
}

export const customersRouter = createCustomersRouter(new CustomersRepository());
