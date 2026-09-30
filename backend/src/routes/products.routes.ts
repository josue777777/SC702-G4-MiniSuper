import { Router } from 'express';
import { ProductsController } from '../controllers/products.controller.js';
import { ProductsRepository } from '../repositories/products.repository.js';
import { ProductsService } from '../services/products.service.js';

/**
 * Rutas del módulo de productos.
 *
 * Se exponen dos cosas: la fábrica (permite montar las MISMAS rutas con un
 * repositorio falso en las pruebas) y el router ya compuesto que se publica en
 * `routes/index.ts`.
 */
export function createProductsRouter(repository: ProductsRepository): Router {
  const productsService = new ProductsService(repository);
  const productsController = new ProductsController(productsService);
  const router = Router();

  /** Listado del catálogo (HU-01, HU-02 y HU-03 lo usan para refrescarse). */
  router.get('/', (req, res) => productsController.list(req, res));

  /**
   * Datos de apoyo de los formularios de HU-01/HU-02. Declarado antes de
   * `/:id` para que no lo capture una ruta con parámetro.
   */
  router.get('/form-options', (req, res) => productsController.getFormOptions(req, res));

  /** Registrar producto (HU-01). */
  router.post('/', (req, res) => productsController.create(req, res));

  /** Editar producto (HU-02). */
  router.patch('/:id', (req, res) => productsController.update(req, res));

  /**
   * Desactivar producto (HU-03). No hay ruta de reactivación: HU-03 no la pide y
   * no se implementa lo que ninguna historia solicita.
   */
  router.patch('/:id/deactivate', (req, res) => productsController.deactivate(req, res));

  return router;
}

/**
 * Composición de dependencias de producción: es el único lugar donde se
 * construyen las capas del flujo.
 */
export const productsRouter = createProductsRouter(new ProductsRepository());
