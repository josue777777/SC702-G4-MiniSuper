import type { ProductsRepository } from '../repositories/products.repository.js';
import type {
  CreateProductPlan,
  InventoryMovementPlan,
  ProductDto,
  ProductFormOptionsDto,
  ProductImage,
  ProductImageMimeType,
  UpdateProductPlan,
} from '../types/products.js';
import { HttpError } from '../utils/http-error.js';
import type {
  CreateProductInput,
  ProductImageInput,
  ProductListQuery,
  UpdateProductInput,
} from '../validators/products.validator.js';

/** Motivo del movimiento que deja el stock inicial de un producto (HU-01). */
export const INITIAL_STOCK_REASON = 'Stock inicial';

/** Motivo del movimiento que deja un ajuste manual de stock (HU-02). */
export const STOCK_ADJUSTMENT_REASON = 'Ajuste desde edición de producto';

/**
 * Ajuste de stock que corresponde a una edición, o `null` si el stock no cambió.
 *
 * `quantity` es la diferencia en valor absoluto, porque en el esquema la
 * cantidad siempre es positiva y el sentido lo da `type` (`ADJUSTMENT` cubre
 * tanto un aumento como una disminución del stock).
 */
export function buildStockAdjustment(
  currentStock: number,
  nextStock: number,
): InventoryMovementPlan | null {
  if (currentStock === nextStock) {
    return null;
  }

  return {
    type: 'ADJUSTMENT',
    quantity: Math.abs(nextStock - currentStock),
    stockBefore: currentStock,
    stockAfter: nextStock,
    reason: STOCK_ADJUSTMENT_REASON,
  };
}

/** Lanza `409` si el código ya lo usa otro producto (HU-01, HU-02). */
async function assertCodeIsAvailable(
  repository: ProductsRepository,
  code: string,
  exceptProductId?: string,
): Promise<void> {
  if (await repository.existsByCode(code, exceptProductId)) {
    throw HttpError.conflict('Ya existe un producto con ese código.');
  }
}

/** Lanza `400` si la categoría no existe o está inactiva (HU-01, HU-02). */
async function assertCategoryIsUsable(
  repository: ProductsRepository,
  categoryId: string,
): Promise<void> {
  if ((await repository.findActiveCategory(categoryId)) === null) {
    throw HttpError.badRequest('La categoría indicada no existe o está inactiva.');
  }
}

/** Lanza `400` si el proveedor no existe o está inactivo (HU-01, HU-02). */
async function assertSupplierIsUsable(
  repository: ProductsRepository,
  supplierId: string,
): Promise<void> {
  if ((await repository.findActiveSupplier(supplierId)) === null) {
    throw HttpError.badRequest('El proveedor indicado no existe o está inactivo.');
  }
}

/**
 * Reglas de negocio del catálogo de productos (HU-01, HU-02, HU-03).
 *
 * No conoce HTTP (nada de `req`/`res`) ni Prisma: recibe el repositorio por
 * constructor, decide qué debe pasar y delega la persistencia. Los errores
 * esperados se lanzan como `HttpError` y el middleware de errores los convierte
 * en la respuesta correspondiente.
 */
/**
 * Primeros bytes ("firma" o "número mágico") de cada formato aceptado. Se
 * revisan porque la cabecera `Content-Type` la escribe el cliente: un archivo
 * cualquiera renombrado como `.png` no tiene la firma de un PNG.
 */
const IMAGE_SIGNATURES: Record<ProductImageMimeType, (data: Uint8Array) => boolean> = {
  'image/png': (data) => startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': (data) => startsWith(data, [0xff, 0xd8, 0xff]),
  // WEBP: "RIFF" + 4 bytes de tamaño + "WEBP".
  'image/webp': (data) =>
    startsWith(data, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(data.subarray(8), [0x57, 0x45, 0x42, 0x50]),
};

function startsWith(data: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => data[index] === byte);
}

export class ProductsService {
  constructor(private readonly repository: ProductsRepository) {}

  /**
   * Lista para la pantalla de administración. Sin filtros incluye los productos
   * inactivos, que es lo que permite comprobar la desactivación de HU-03. Al
   * filtrar por categoría, buscar (HU-05) o ambas cosas a la vez, solo devuelve
   * los activos.
   */
  async listProducts(query: ProductListQuery = {}): Promise<ProductDto[]> {
    const { categoryId, q: search } = query;

    if (categoryId === undefined && search === undefined) {
      return this.repository.list();
    }

    return this.repository.list({ categoryId, search, activeOnly: true });
  }

  /**
   * Datos de apoyo de los formularios. Solo categorías y proveedores activos:
   * un formulario no debe ofrecer una opción que el backend va a rechazar.
   */
  async getFormOptions(): Promise<ProductFormOptionsDto> {
    const [categories, suppliers] = await Promise.all([
      this.repository.listActiveCategories(),
      this.repository.listActiveSuppliers(),
    ]);

    return { categories, suppliers };
  }

  /**
   * HU-01 — registrar producto.
   *
   * Valida que el código no esté repetido y que la categoría y el proveedor sean
   * utilizables, y encarga al repositorio la creación del producto, la relación
   * con el proveedor principal y el movimiento de entrada del stock inicial,
   * todo en una transacción.
   */
  async createProduct(input: CreateProductInput): Promise<ProductDto> {
    await assertCodeIsAvailable(this.repository, input.code);
    await assertCategoryIsUsable(this.repository, input.categoryId);
    await assertSupplierIsUsable(this.repository, input.supplierId);

    const plan: CreateProductPlan = {
      fields: input,
      initialMovement:
        input.stock > 0
          ? {
              type: 'ENTRY',
              quantity: input.stock,
              stockBefore: 0,
              stockAfter: input.stock,
              reason: INITIAL_STOCK_REASON,
            }
          : null,
    };

    return this.repository.createProduct(plan);
  }

  /**
   * HU-02 — editar producto.
   *
   * Además de validar los datos, deja constancia del cambio de stock: si el
   * dueño modifica la cantidad a mano se registra un `ADJUSTMENT` con el antes y
   * el después, en lugar de mover `Product.stock` en silencio (HU-10).
   *
   * No toca las ventas ya registradas: `SaleItem` guarda su propio precio y
   * costo, así que cambiar el precio del producto no reescribe el historial.
   */
  async updateProduct(id: string, input: UpdateProductInput): Promise<ProductDto> {
    const current = await this.repository.findById(id);

    if (current === null) {
      throw HttpError.notFound('El producto no existe.');
    }

    if (input.code !== current.code) {
      await assertCodeIsAvailable(this.repository, input.code, id);
    }

    await assertCategoryIsUsable(this.repository, input.categoryId);
    await assertSupplierIsUsable(this.repository, input.supplierId);

    const plan: UpdateProductPlan = {
      fields: input,
      stockMovement: buildStockAdjustment(current.stock, input.stock),
    };

    return this.repository.updateProduct(id, plan);
  }

  /**
   * HU-03 — desactivar producto (baja lógica).
   *
   * Nunca borra: solo pone `isActive = false`, de modo que el producto deja de
   * ofrecerse en ventas pero las ventas y los movimientos que lo referencian
   * siguen existiendo. Es idempotente: si ya estaba inactivo se devuelve tal
   * cual, sin escribir otra vez.
   */
  async deactivateProduct(id: string): Promise<ProductDto> {
    const current = await this.repository.findById(id);

    if (current === null) {
      throw HttpError.notFound('El producto no existe.');
    }

    if (!current.isActive) {
      return current;
    }

    return this.repository.deactivate(id);
  }

  /**
   * HU-01 — imagen opcional del producto. Reemplaza la anterior si había una.
   * Rechaza el archivo si su contenido no coincide con el tipo declarado.
   */
  async setProductImage(id: string, image: ProductImageInput): Promise<ProductDto> {
    await this.requireProduct(id);

    if (!IMAGE_SIGNATURES[image.mimeType](image.data)) {
      throw HttpError.badRequest('El archivo no es una imagen PNG, JPG o WEBP válida.');
    }

    return this.repository.saveImage(id, image);
  }

  /** HU-01 — imagen guardada del producto, para mostrarla en su ficha. */
  async getProductImage(id: string): Promise<ProductImage> {
    const image = await this.repository.findImage(id);

    if (image === null) {
      throw HttpError.notFound('El producto no tiene imagen.');
    }

    return image;
  }

  /** HU-01 — quitar la imagen. Si no tenía, no escribe nada. */
  async removeProductImage(id: string): Promise<ProductDto> {
    const current = await this.requireProduct(id);

    return current.imageUrl === null ? current : this.repository.removeImage(id);
  }

  private async requireProduct(id: string): Promise<ProductDto> {
    const current = await this.repository.findById(id);

    if (current === null) {
      throw HttpError.notFound('El producto no existe.');
    }

    return current;
  }
}
