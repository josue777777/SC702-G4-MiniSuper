import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { ProductsController } from '../controllers/products.controller.js';
import { ProductsRepository } from '../repositories/products.repository.js';
import { ProductsService } from '../services/products.service.js';
import { HttpError } from '../utils/http-error.js';
import { MAX_PRODUCT_IMAGE_BYTES } from '../validators/products.validator.js';

/**
 * Lee el cuerpo de la imagen como bytes, con tope de tamaño. Si el archivo se
 * pasa del tope, responde 413 con un mensaje claro en vez de un error 500.
 */
const readImageBytes = express.raw({ type: () => true, limit: MAX_PRODUCT_IMAGE_BYTES });

function imageBody(req: Request, res: Response, next: NextFunction): void {
  void readImageBytes(req, res, (error?: unknown) => {
    if ((error as { type?: string } | undefined)?.type === 'entity.too.large') {
      next(new HttpError(413, 'La imagen supera el máximo de 2 MB.'));

      return;
    }

    next(error);
  });
}

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

  /** Exportar el catálogo activo a Excel (HU-33). Antes de `/:id`, como `form-options`. */
  router.get('/export', (req, res) => productsController.exportCatalog(req, res));

  /**
   * Datos de apoyo de los formularios de HU-01/HU-02. Declarado antes de
   * `/:id` para que no lo capture una ruta con parámetro.
   */
  router.get('/form-options', (req, res) => productsController.getFormOptions(req, res));

  /** Registrar producto (HU-01). */
  router.post('/', (req, res) => productsController.create(req, res));

  /** Editar producto (HU-02). */
  router.patch('/:id', (req, res) => productsController.update(req, res));

  /** Generar o reemplazar código de barras (HU-07). */
  router.post('/:id/barcode', (req, res) => productsController.generateBarcode(req, res));

  /** Desactivar producto (HU-03). */
  router.patch('/:id/deactivate', (req, res) => productsController.deactivate(req, res));

  /** Volver a activar un producto desactivado (HU-03). */
  router.patch('/:id/activate', (req, res) => productsController.activate(req, res));

  /**
   * Borrar para siempre (HU-03): solo un producto desactivado y sin ventas ni
   * pedidos. Más adelante, solo para el administrador.
   */
  router.delete('/:id', (req, res) => productsController.remove(req, res));

  /** Imagen opcional del producto (HU-01): verla, subirla o reemplazarla, y quitarla. */
  router.get('/:id/image', (req, res) => productsController.getImage(req, res));
  router.put('/:id/image', imageBody, (req, res) => productsController.setImage(req, res));
  router.delete('/:id/image', (req, res) => productsController.removeImage(req, res));

  return router;
}

/**
 * Composición de dependencias de producción: es el único lugar donde se
 * construyen las capas del flujo.
 */
export const productsRouter = createProductsRouter(new ProductsRepository());
