import { Router } from 'express';
import { SalesController } from '../controllers/sales.controller.js';
import { CustomersRepository } from '../repositories/customers.repository.js';
import { SalesRepository } from '../repositories/sales.repository.js';
import { SalesService } from '../services/sales.service.js';
import type { ForBusiness } from '../types/tenant.js';

/** Fábrica de rutas: permite montarlas con repositorios falsos en las pruebas. */
export function createSalesRouter(
  repositoryFor: ForBusiness<SalesRepository>,
  customersFor: ForBusiness<CustomersRepository>,
): Router {
  const controller = new SalesController(
    (businessId) => new SalesService(repositoryFor(businessId), customersFor(businessId)),
  );
  const router = Router();

  /** Resumen completo del día, antes de `/:id` (HU-37). */
  router.get('/daily-summary', (req, res) => controller.dailySummary(req, res));
  /** Producto por código o código de barras (HU-16). Antes de `/:id`. */
  router.get('/lookup', (req, res) => controller.lookup(req, res));
  /** Historial mínimo con filtro por método de pago (HU-17). */
  router.get('/', (req, res) => controller.list(req, res));
  router.get('/:id', (req, res) => controller.get(req, res));
  /** Confirmar la venta (HU-16, HU-17, HU-18). */
  router.post('/', (req, res) => controller.create(req, res));
  /** Devolver productos o anular la venta, con auditoría y stock (HU-35). */
  router.post('/:id/adjustments', (req, res) => controller.adjust(req, res));

  return router;
}

export const salesRouter = createSalesRouter(
  (businessId) => new SalesRepository(businessId),
  (businessId) => new CustomersRepository(businessId),
);
