import { Router } from 'express';
import { InventoryController } from '../controllers/inventory.controller.js';
import { InventoryRepository } from '../repositories/inventory.repository.js';
import { InventoryService } from '../services/inventory.service.js';

/**
 * Rutas del módulo de inventario. Igual que en productos, se exponen la fábrica
 * (para montarla con un repositorio falso en las pruebas) y el router compuesto.
 */
export function createInventoryRouter(repository: InventoryRepository): Router {
  const inventoryService = new InventoryService(repository);
  const inventoryController = new InventoryController(inventoryService);
  const router = Router();

  /** Historial de conteos físicos (HU-10). */
  router.get('/counts', (req, res) => inventoryController.listCounts(req, res));

  /**
   * Registrar conteo físico (HU-10). No hay rutas de edición ni de borrado: un
   * conteo confirmado no se puede modificar.
   */
  router.post('/counts', (req, res) => inventoryController.createCount(req, res));

  return router;
}

/** Composición de dependencias de producción. */
export const inventoryRouter = createInventoryRouter(new InventoryRepository());
