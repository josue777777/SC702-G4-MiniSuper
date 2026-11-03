import { Router } from 'express';
import { KardexController } from '../controllers/kardex.controller.js';
import { KardexRepository } from '../repositories/kardex.repository.js';
import { KardexService } from '../services/kardex.service.js';
import type { ForBusiness } from '../types/tenant.js';

/**
 * Kardex: ficha e historial de movimientos de un producto (HU-31). Solo
 * `GET`: no hay rutas que cambien inventario. Se monta en `/api/kardex` con el
 * permiso `kardex` (ver `routes/index.ts`).
 */
export function createKardexRouter(repositoryFor: ForBusiness<KardexRepository>): Router {
  const controller = new KardexController(
    (businessId) => new KardexService(repositoryFor(businessId)),
  );
  const router = Router();

  router.get('/products', (req, res) => controller.searchProducts(req, res));
  router.get('/products/:productId', (req, res) => controller.getProduct(req, res));
  router.get('/products/:productId/movements', (req, res) => controller.listMovements(req, res));

  return router;
}

export const kardexRouter = createKardexRouter((businessId) => new KardexRepository(businessId));
