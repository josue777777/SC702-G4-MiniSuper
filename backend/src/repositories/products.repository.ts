import { prisma } from '../config/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { dateToDateOnly } from '../utils/dates.js';
import type {
  CreateProductPlan,
  ProductDto,
  ProductImage,
  ProductImageMimeType,
  ProductReferences,
  ProductListFilter,
  ReferenceOption,
  UpdateProductPlan,
} from '../types/products.js';

/**
 * Fila de producto tal como la devuelve `productSelection`.
 *
 * `price` y `cost` se tipan por lo que esta capa realmente usa (`toFixed`) en
 * lugar del tipo `Decimal` generado por Prisma: así la capa de datos no arrastra
 * el cliente generado hacia los tipos del módulo.
 */
interface ProductRow {
  id: string;
  code: string;
  barcode: string | null;
  name: string;
  price: { toFixed(digits: number): string };
  cost: { toFixed(digits: number): string };
  stock: number;
  isActive: boolean;
  minStock: number;
  expirationDate: Date | null;
  imageMimeType: string | null;
  imageUpdatedAt: Date | null;
  category: { id: string; name: string };
  supplierProducts: { supplierId: string; supplier: { name: string } }[];
}

/**
 * Columnas y relaciones que necesita la pantalla de productos. Se declara una
 * sola vez para que `list()` y `findById()` devuelvan exactamente la misma forma.
 * Se pide únicamente el `SupplierProduct` preferido: es el proveedor principal.
 */
const productSelection = {
  id: true,
  code: true,
  barcode: true,
  name: true,
  price: true,
  cost: true,
  stock: true,
  isActive: true,
  minStock: true,
  expirationDate: true,
  // Solo los datos de la imagen, nunca sus bytes: el listado sigue liviano.
  imageMimeType: true,
  imageUpdatedAt: true,
  category: { select: { id: true, name: true } },
  supplierProducts: {
    where: { isPreferred: true },
    select: { supplierId: true, supplier: { select: { name: true } } },
  },
} as const;

const referenceSelection = { id: true, name: true } as const;

/** Normaliza una fila de Prisma a la forma que expone la API (dinero como cadena). */
function toProductDto(row: ProductRow): ProductDto {
  const preferredSupplier = row.supplierProducts[0];

  return {
    id: row.id,
    code: row.code,
    barcode: row.barcode,
    name: row.name,
    categoryId: row.category.id,
    categoryName: row.category.name,
    price: row.price.toFixed(2),
    cost: row.cost.toFixed(2),
    stock: row.stock,
    isActive: row.isActive,
    preferredSupplierId: preferredSupplier?.supplierId ?? null,
    preferredSupplierName: preferredSupplier?.supplier.name ?? null,
    minStock: row.minStock,
    expirationDate: row.expirationDate === null ? null : dateToDateOnly(row.expirationDate),
    imageUrl:
      row.imageMimeType === null || row.imageUpdatedAt === null
        ? null
        : `/api/products/${row.id}/image?v=${row.imageUpdatedAt.getTime()}`,
  };
}

/** `where` de un producto de ese negocio: un id de otro negocio no coincide. */
function own(businessId: string, id: string) {
  return { id, businessId };
}

/**
 * Lee un producto ya escrito. Se usa al final de cada operación de escritura
 * para que la respuesta tenga siempre la misma forma (con categoría y proveedor
 * principal resueltos) sin repetir el armado del DTO en cada método.
 */
async function readProduct(businessId: string, id: string): Promise<ProductDto> {
  const row = await prisma.product.findFirst({
    where: { id, businessId },
    select: productSelection,
  });

  if (row === null) {
    // No debería ocurrir: se escribe y se lee dentro del mismo flujo.
    throw new Error(`El producto ${id} no existe.`);
  }

  return toProductDto(row);
}

/**
 * Capa de acceso a datos del módulo de productos, atada a UN negocio: toda
 * consulta y escritura filtra por `businessId` (multi-negocio, ADR 0002). Un id
 * de otro negocio se comporta como si no existiera.
 *
 * Es la ÚNICA capa del flujo que importa Prisma. Recibe y devuelve datos del
 * dominio (nunca `req`/`res`), y las reglas de negocio no están aquí: el service
 * decide qué escribir y este repositorio lo persiste, incluida la transacción.
 *
 * No tiene miembros privados a propósito: así el service se puede probar con un
 * repositorio falso que simplemente `implements ProductsRepository`.
 */
export class ProductsRepository {
  constructor(readonly businessId: string) {}

  /**
   * Los productos, activos e inactivos salvo que el filtro diga lo contrario.
   *
   * La pantalla de administración necesita ver los inactivos para comprobar la
   * desactivación (HU-03). Las consultas de venta (HU-16) filtrarán por
   * `isActive = true`; eso corresponde a esa historia, no a esta.
   *
   * Con `search` (HU-05) se busca por fragmento del nombre o del código, sin
   * distinguir mayúsculas. El filtro de categoría se combina con la búsqueda.
   */
  async list(filter: ProductListFilter = {}): Promise<ProductDto[]> {
    const rows = await prisma.product.findMany({
      where: {
        businessId: this.businessId,
        ...(filter.categoryId === undefined ? {} : { categoryId: filter.categoryId }),
        ...(filter.activeOnly === true ? { isActive: true } : {}),
        ...(filter.search === undefined
          ? {}
          : {
              OR: [
                { name: { contains: filter.search, mode: 'insensitive' as const } },
                { code: { contains: filter.search, mode: 'insensitive' as const } },
              ],
            }),
      },
      select: productSelection,
      orderBy: { name: 'asc' },
    });

    return rows.map(toProductDto);
  }

  /** Un producto por id, o `null` si no existe. */
  async findById(id: string): Promise<ProductDto | null> {
    const row = await prisma.product.findFirst({
      where: own(this.businessId, id),
      select: productSelection,
    });

    return row === null ? null : toProductDto(row);
  }

  /**
   * `true` si el código ya lo usa otro producto.
   *
   * `exceptProductId` permite editar el resto de campos conservando el código
   * (HU-02): el propio producto no debe contar como duplicado.
   */
  async existsByCode(code: string, exceptProductId?: string): Promise<boolean> {
    const found = await prisma.product.findFirst({
      where: {
        businessId: this.businessId,
        code,
        ...(exceptProductId === undefined ? {} : { id: { not: exceptProductId } }),
      },
      select: { id: true },
    });

    return found !== null;
  }

  /**
   * Asigna el código de barras en una sola escritura. Si no se permite
   * reemplazar, la condición `barcode: null` evita que dos solicitudes lo
   * reemplacen silenciosamente en una carrera.
   */
  async assignBarcode(
    id: string,
    barcode: string,
    replaceExisting: boolean,
  ): Promise<ProductDto | null> {
    try {
      const result = await prisma.product.updateMany({
        where: { ...own(this.businessId, id), ...(replaceExisting ? {} : { barcode: null }) },
        data: { barcode },
      });

      return result.count === 0 ? null : readProduct(this.businessId, id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return null;
      }

      throw error;
    }
  }

  /** Categoría utilizable en el formulario: existe y está activa. */
  async findActiveCategory(categoryId: string): Promise<ReferenceOption | null> {
    return prisma.category.findFirst({
      where: { id: categoryId, businessId: this.businessId, isActive: true },
      select: referenceSelection,
    });
  }

  /** Proveedor utilizable: existe y está activo. */
  async findActiveSupplier(supplierId: string): Promise<ReferenceOption | null> {
    return prisma.supplier.findFirst({
      where: { id: supplierId, businessId: this.businessId, isActive: true },
      select: referenceSelection,
    });
  }

  /** Categorías activas para el `<select>` del formulario. */
  async listActiveCategories(): Promise<ReferenceOption[]> {
    return prisma.category.findMany({
      where: { businessId: this.businessId, isActive: true },
      select: referenceSelection,
      orderBy: { name: 'asc' },
    });
  }

  /** Proveedores activos para el `<select>` del formulario. */
  async listActiveSuppliers(): Promise<ReferenceOption[]> {
    return prisma.supplier.findMany({
      where: { businessId: this.businessId, isActive: true },
      select: referenceSelection,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Crea el producto con su proveedor principal y, si hay stock inicial, su
   * movimiento de entrada. Todo en UNA transacción: si falla el movimiento, no
   * queda un producto a medias (HU-01).
   */
  async createProduct(plan: CreateProductPlan): Promise<ProductDto> {
    const { fields, initialMovement } = plan;

    const productId = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          businessId: this.businessId,
          code: fields.code,
          name: fields.name,
          categoryId: fields.categoryId,
          price: fields.price,
          cost: fields.cost,
          stock: fields.stock,
        },
        select: { id: true },
      });

      // El proveedor elegido en el formulario queda como principal del producto.
      await tx.supplierProduct.create({
        data: {
          supplierId: fields.supplierId,
          productId: product.id,
          unitCost: fields.cost,
          isPreferred: true,
        },
      });

      if (initialMovement !== null) {
        await tx.inventoryMovement.create({
          data: { productId: product.id, ...initialMovement },
        });
      }

      return product.id;
    });

    return readProduct(this.businessId, productId);
  }

  /**
   * Guarda los cambios del producto (HU-02).
   *
   * Mantiene las relaciones con los demás proveedores y garantiza que haya como
   * mucho UN proveedor principal: primero libera a los otros, después marca el
   * elegido (creándolo si el producto todavía no se compraba a él) y sincroniza
   * su `unitCost` con el costo del producto. El ajuste de stock, si lo hay, entra
   * en la misma transacción.
   *
   * No toca `SaleItem`: el precio y el costo de una venta ya registrada son una
   * foto del momento en que se vendió y no deben cambiar (HU-02).
   */
  async updateProduct(id: string, plan: UpdateProductPlan): Promise<ProductDto> {
    const { fields, stockMovement } = plan;

    await prisma.$transaction(async (tx) => {
      await tx.product.updateMany({
        where: own(this.businessId, id),
        data: {
          code: fields.code,
          name: fields.name,
          categoryId: fields.categoryId,
          price: fields.price,
          cost: fields.cost,
          stock: fields.stock,
        },
      });

      await tx.supplierProduct.updateMany({
        where: { productId: id, supplierId: { not: fields.supplierId } },
        data: { isPreferred: false },
      });

      await tx.supplierProduct.upsert({
        where: {
          supplierId_productId: { supplierId: fields.supplierId, productId: id },
        },
        create: {
          supplierId: fields.supplierId,
          productId: id,
          unitCost: fields.cost,
          isPreferred: true,
        },
        update: { unitCost: fields.cost, isPreferred: true },
      });

      if (stockMovement !== null) {
        await tx.inventoryMovement.create({ data: { productId: id, ...stockMovement } });
      }
    });

    return readProduct(this.businessId, id);
  }

  /** Imagen del producto (HU-01), o `null` si no tiene o el producto no existe. */
  async findImage(id: string): Promise<ProductImage | null> {
    const row = await prisma.product.findFirst({
      where: own(this.businessId, id),
      select: { imageData: true, imageMimeType: true },
    });

    if (row === null || row.imageData === null || row.imageMimeType === null) {
      return null;
    }

    return { data: row.imageData, mimeType: row.imageMimeType as ProductImageMimeType };
  }

  /** Guarda o reemplaza la imagen (HU-01). No es un cambio de stock: no hay movimiento. */
  async saveImage(id: string, image: ProductImage): Promise<ProductDto> {
    await prisma.product.updateMany({
      where: own(this.businessId, id),
      data: {
        imageData: Buffer.from(image.data),
        imageMimeType: image.mimeType,
        imageUpdatedAt: new Date(),
      },
    });

    return readProduct(this.businessId, id);
  }

  /** Quita la imagen del producto (HU-01). */
  async removeImage(id: string): Promise<ProductDto> {
    await prisma.product.updateMany({
      where: own(this.businessId, id),
      data: { imageData: null, imageMimeType: null, imageUpdatedAt: null },
    });

    return readProduct(this.businessId, id);
  }

  /**
   * Baja lógica del producto (HU-03): solo `isActive = false`.
   *
   * No se borra ninguna fila: `Product` sigue referenciado por `SaleItem`,
   * `InventoryMovement`, `SupplierProduct` y `PurchaseOrderItem`, y esas ventas
   * históricas deben seguir existiendo para los reportes.
   */
  async deactivate(id: string): Promise<ProductDto> {
    await prisma.product.updateMany({ where: own(this.businessId, id), data: { isActive: false } });

    return readProduct(this.businessId, id);
  }

  async activate(id: string): Promise<ProductDto> {
    await prisma.product.updateMany({ where: own(this.businessId, id), data: { isActive: true } });

    return readProduct(this.businessId, id);
  }

  /** Cuántas ventas y pedidos a proveedor incluyen este producto. */
  async countReferences(id: string): Promise<ProductReferences> {
    const [sales, purchaseOrders] = await Promise.all([
      prisma.saleItem.count({ where: { productId: id, product: { businessId: this.businessId } } }),
      prisma.purchaseOrderItem.count({
        where: { productId: id, product: { businessId: this.businessId } },
      }),
    ]);

    return { sales, purchaseOrders };
  }

  /**
   * Borra el producto para siempre, junto con sus movimientos de stock, en una
   * sola transacción. Las relaciones con proveedores se borran solas (Cascade).
   * Solo se llama cuando el service ya comprobó que no tiene ventas ni pedidos.
   */
  async deletePermanently(id: string): Promise<void> {
    await prisma.$transaction([
      prisma.inventoryMovement.deleteMany({
        where: { productId: id, product: { businessId: this.businessId } },
      }),
      prisma.product.deleteMany({ where: own(this.businessId, id) }),
    ]);
  }
}
