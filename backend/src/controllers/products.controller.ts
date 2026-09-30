import type { Request, Response } from 'express';
import type { ProductsService } from '../services/products.service.js';
import {
  createProductSchema,
  productIdParamSchema,
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
   * `GET /api/products` — listado para administrar el catálogo.
   * Incluye los productos inactivos a propósito (ver ProductsService).
   */
  async list(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await this.service.listProducts() });
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
}
