import { Router } from 'express';
import { CreditController } from '../controllers/credit.controller.js';
import { CustomerHistoryController } from '../controllers/customer-history.controller.js';
import { CustomersController } from '../controllers/customers.controller.js';
import { CreditRepository } from '../repositories/credit.repository.js';
import { CustomersRepository } from '../repositories/customers.repository.js';
import { SalesRepository } from '../repositories/sales.repository.js';
import { CreditService } from '../services/credit.service.js';
import { CustomerHistoryService } from '../services/customer-history.service.js';
import { CustomersService } from '../services/customers.service.js';
import type { ForBusiness } from '../types/tenant.js';

/**
 * Fábrica de rutas: permite montarlas con repositorios falsos en las pruebas.
 * Clientes (HU-18), sus cuentas y abonos (HU-19), y compras asociadas (HU-36);
 * todo con el permiso `customers`.
 */
export function createCustomersRouter(
  repositoryFor: ForBusiness<CustomersRepository>,
  creditRepositoryFor: ForBusiness<CreditRepository> = (businessId) =>
    new CreditRepository(businessId),
  salesRepositoryFor: ForBusiness<Pick<SalesRepository, 'customerHistory'>> = (businessId) =>
    new SalesRepository(businessId),
): Router {
  const controller = new CustomersController(
    (businessId) => new CustomersService(repositoryFor(businessId)),
  );
  const creditServiceFor = (businessId: string) =>
    new CreditService(creditRepositoryFor(businessId));
  const credit = new CreditController(creditServiceFor);
  const history = new CustomerHistoryController(
    (businessId) =>
      new CustomerHistoryService(salesRepositoryFor(businessId), creditServiceFor(businessId)),
  );
  const router = Router();

  router.get('/', (req, res) => controller.list(req, res));
  router.post('/', (req, res) => controller.create(req, res));

  // HU-36: compras al contado y fiados con el estado derivado de HU-19.
  router.get('/:id/purchases', (req, res) => history.purchases(req, res));

  // HU-19: deuda del cliente, historial de abonos y registro de un abono.
  router.get('/:id/credit', (req, res) => credit.getCredit(req, res));
  router.get('/:id/payments', (req, res) => credit.listPayments(req, res));
  router.post('/:id/payments', (req, res) => credit.registerPayment(req, res));

  return router;
}

export const customersRouter = createCustomersRouter(
  (businessId) => new CustomersRepository(businessId),
);
