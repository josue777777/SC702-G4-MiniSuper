import { Router } from 'express';
import { KardexController } from '../controllers/kardex.controller.js';
import { requirePermission } from '../middleware/require-auth.middleware.js';
import { KardexRepository } from '../repositories/kardex.repository.js';
import { KardexService } from '../services/kardex.service.js';
import type { ForBusiness } from '../types/tenant.js';

/**
 * Kardex: ficha e historial de movimientos de un producto (HU-31). Se monta en
 * `/api/kardex` con el permiso `kardex` (ver `routes/index.ts`). Las dos
 * rutas que cambian inventario (HU-38) piden además su propio permiso: el
 * ingreso, `purchasing` (como recibir un pedido); el egreso, `inventory.write`.
 */
export function createKardexRouter(repositoryFor: ForBusiness<KardexRepository>): Router {
  const controller = new KardexController(
    (businessId) => new KardexService(repositoryFor(businessId)),
  );
  const router = Router();

  router.get('/movements', (req, res) => controller.listRecentMovements(req, res));
  router.get('/products', (req, res) => controller.searchProducts(req, res));
  router.get('/products/:productId', (req, res) => controller.getProduct(req, res));
  router.get('/products/:productId/movements', (req, res) => controller.listMovements(req, res));
  router.get('/products/:productId/lots', (req, res) => controller.listStockLots(req, res));
  router.post('/products/:productId/entries', requirePermission('purchasing'), (req, res) =>
    controller.registerEntry(req, res),
  );
  router.post('/products/:productId/exits', requirePermission('inventory.write'), (req, res) =>
    controller.registerExit(req, res),
  );

  return router;
}

export const kardexRouter = createKardexRouter((businessId) => new KardexRepository(businessId));
