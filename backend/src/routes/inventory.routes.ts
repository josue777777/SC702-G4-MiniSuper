import { Router } from 'express';
import { InventoryController } from '../controllers/inventory.controller.js';
import { InventoryRepository } from '../repositories/inventory.repository.js';
import { InventoryService } from '../services/inventory.service.js';

/**
 * Rutas del módulo de inventario. Igual que en productos, se exponen la fábrica
 * (para montarla con un repositorio falso en las pruebas) y el router compuesto.
 */
export function createInventoryRouter(
  repository: InventoryRepository,
  today?: () => string,
): Router {
  const inventoryService = new InventoryService(repository, today);
  const inventoryController = new InventoryController(inventoryService);
  const router = Router();

  /** Historial de conteos físicos (HU-10). */
  router.get('/counts', (req, res) => inventoryController.listCounts(req, res));

  /**
   * Registrar conteo físico (HU-10). No hay rutas de edición ni de borrado: un
   * conteo confirmado no se puede modificar.
   */
  router.post('/counts', (req, res) => inventoryController.createCount(req, res));

  /** Alertas de stock bajo para el panel principal (HU-08). */
  router.get('/low-stock', (req, res) => inventoryController.listLowStock(req, res));

  /** Mínimo de stock y vencimiento por producto activo (HU-08, HU-09). */
  router.get('/products', (req, res) => inventoryController.listProductSettings(req, res));
  router.patch('/products/:id/min-stock', (req, res) =>
    inventoryController.updateMinStock(req, res),
  );
  router.patch('/products/:id/expiration-date', (req, res) =>
    inventoryController.updateExpirationDate(req, res),
  );

  /** Productos vencidos y próximos a vencer (HU-09). */
  router.get('/expirations', (req, res) => inventoryController.listExpirations(req, res));

  return router;
}

/** Composición de dependencias de producción. */
export const inventoryRouter = createInventoryRouter(new InventoryRepository());
