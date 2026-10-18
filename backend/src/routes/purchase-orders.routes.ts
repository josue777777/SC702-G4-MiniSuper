import { Router } from 'express';
import { PurchaseOrdersController } from '../controllers/purchase-orders.controller.js';
import { PurchaseOrdersRepository } from '../repositories/purchase-orders.repository.js';
import { PurchaseOrdersService } from '../services/purchase-orders.service.js';

/** Fábrica de rutas de pedidos: permite montarlas con un repositorio falso. */
export function createPurchaseOrdersRouter(repository: PurchaseOrdersRepository): Router {
  const controller = new PurchaseOrdersController(new PurchaseOrdersService(repository));
  const router = Router();

  /** Historial de pedidos, filtrable por proveedor (HU-22). */
  router.get('/', (req, res) => controller.list(req, res));
  /** Detalle de un pedido (HU-22) y datos del PDF (HU-24). */
  router.get('/:id', (req, res) => controller.getById(req, res));
  /** Registrar pedido (HU-24). La recepción es HU-38. */
  router.post('/', (req, res) => controller.create(req, res));

  return router;
}

export const purchaseOrdersRouter = createPurchaseOrdersRouter(new PurchaseOrdersRepository());
