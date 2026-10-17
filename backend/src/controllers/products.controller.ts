import type { Request, Response } from 'express';
import type { ProductsService } from '../services/products.service.js';
import {
  createProductSchema,
  productIdParamSchema,
  productImageSchema,
  productListQuerySchema,
  updateProductSchema,
} from '../validators/products.validator.js';

/**
 * Capa de controlador del módulo de productos (HU-01, HU-02, HU-03).
 *
 * Traduce HTTP ↔ service: valida la entrada con los esquemas Zod, llama al
 * service y elige el status code. No contiene reglas de negocio ni consultas.
 *
 * Forma de las respuestas de este módulo: el recurso viaja dentro de `data`, de
 * modo que agregar metadatos después (por ejemplo un total en HU-05) no rompe a
 * los clientes que ya existen. `/api/health` queda como está: es un sondeo de
 * infraestructura, no un recurso.
 *
 * En Express 5 un `throw` en un handler `async` llega solo al middleware de
 * errores, así que no hay try/catch.
 */
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  /**
   * `GET /api/products[?categoryId=<uuid>][&q=<texto>]` — listado para administrar el catálogo.
   * Sin filtros incluye los inactivos; con `categoryId`, `q` (HU-05) o ambos, solo los
   * activos (ver ProductsService).
   */
  async list(req: Request, res: Response): Promise<void> {
    const query = productListQuerySchema.parse(req.query);

    res.status(200).json({ data: await this.service.listProducts(query) });
  }

  /** `GET /api/products/form-options` — categorías y proveedores activos. */
  async getFormOptions(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.service.getFormOptions() });
  }

  /** `POST /api/products` — registrar producto (HU-01). */
  async create(req: Request, res: Response): Promise<void> {
    const input = createProductSchema.parse(req.body);

    res.status(201).json({ data: await this.service.createProduct(input) });
  }

  /** `PATCH /api/products/:id` — editar producto (HU-02). */
  async update(req: Request, res: Response): Promise<void> {
    const { id } = productIdParamSchema.parse(req.params);
    const input = updateProductSchema.parse(req.body);

    res.status(200).json({ data: await this.service.updateProduct(id, input) });
  }

  /** `PATCH /api/products/:id/deactivate` — baja lógica (HU-03). */
  async deactivate(req: Request, res: Response): Promise<void> {
    const { id } = productIdParamSchema.parse(req.params);

    res.status(200).json({ data: await this.service.deactivateProduct(id) });
  }

  /** `DELETE /api/products/:id` — borrar para siempre un producto desactivado (HU-03). */
  async remove(req: Request, res: Response): Promise<void> {
    const { id } = productIdParamSchema.parse(req.params);
    await this.service.deleteProduct(id);

    res.status(200).json({ data: { id } });
  }

  /**
   * `GET /api/products/:id/image` — los bytes de la imagen (HU-01), para usarla
   * en `<img src>`. La URL cambia con cada imagen nueva (`?v=`), así que el
   * navegador puede guardarla en caché sin riesgo de mostrar una vieja.
   */
  async getImage(req: Request, res: Response): Promise<void> {
    const { id } = productIdParamSchema.parse(req.params);
    const image = await this.service.getProductImage(id);

    // helmet() bloquea por defecto que otro origen use los recursos de la API;
    // la imagen de un producto no es un dato sensible y el frontend vive en
    // otro puerto, así que solo esta respuesta lo permite.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.type(image.mimeType).send(Buffer.from(image.data));
  }

  /** `PUT /api/products/:id/image` — subir o reemplazar la imagen (HU-01). */
  async setImage(req: Request, res: Response): Promise<void> {
    const { id } = productIdParamSchema.parse(req.params);
    const image = productImageSchema.parse({
      mimeType: req.headers['content-type']?.split(';')[0]?.trim().toLowerCase(),
      data: req.body,
    });

    res.status(200).json({ data: await this.service.setProductImage(id, image) });
  }

  /** `DELETE /api/products/:id/image` — quitar la imagen (HU-01). */
  async removeImage(req: Request, res: Response): Promise<void> {
    const { id } = productIdParamSchema.parse(req.params);

    res.status(200).json({ data: await this.service.removeProductImage(id) });
  }
}
