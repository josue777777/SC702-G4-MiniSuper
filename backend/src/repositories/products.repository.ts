import { prisma } from '../config/prisma.js';
import type {
  CreateProductPlan,
  ProductDto,
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
  name: string;
  price: { toFixed(digits: number): string };
  cost: { toFixed(digits: number): string };
  stock: number;
  isActive: boolean;
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
  name: true,
  price: true,
  cost: true,
  stock: true,
  isActive: true,
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
    name: row.name,
    categoryId: row.category.id,
    categoryName: row.category.name,
    price: row.price.toFixed(2),
    cost: row.cost.toFixed(2),
    stock: row.stock,
    isActive: row.isActive,
    preferredSupplierId: preferredSupplier?.supplierId ?? null,
    preferredSupplierName: preferredSupplier?.supplier.name ?? null,
  };
}

/**
 * Lee un producto ya escrito. Se usa al final de cada operación de escritura
 * para que la respuesta tenga siempre la misma forma (con categoría y proveedor
 * principal resueltos) sin repetir el armado del DTO en cada método.
 */
async function readProduct(id: string): Promise<ProductDto> {
  const row = await prisma.product.findUnique({ where: { id }, select: productSelection });

  if (row === null) {
    // No debería ocurrir: se escribe y se lee dentro del mismo flujo.
    throw new Error(`El producto ${id} no existe.`);
  }

  return toProductDto(row);
}

/**
 * Capa de acceso a datos del módulo de productos.
 *
 * Es la ÚNICA capa del flujo que importa Prisma. Recibe y devuelve datos del
 * dominio (nunca `req`/`res`), y las reglas de negocio no están aquí: el service
 * decide qué escribir y este repositorio lo persiste, incluida la transacción.
 *
 * No tiene miembros privados a propósito: así el service se puede probar con un
 * repositorio falso que simplemente `implements ProductsRepository`.
 */
export class ProductsRepository {
  /**
   * Todos los productos, activos e inactivos.
   *
   * La pantalla de administración necesita ver los inactivos para comprobar la
   * desactivación (HU-03). Las consultas de venta (HU-16) filtrarán por
   * `isActive = true`; eso corresponde a esa historia, no a esta.
   */
  async list(): Promise<ProductDto[]> {
    const rows = await prisma.product.findMany({
      select: productSelection,
      orderBy: { name: 'asc' },
    });

    return rows.map(toProductDto);
  }

  /** Un producto por id, o `null` si no existe. */
  async findById(id: string): Promise<ProductDto | null> {
    const row = await prisma.product.findUnique({ where: { id }, select: productSelection });

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
        code,
        ...(exceptProductId === undefined ? {} : { id: { not: exceptProductId } }),
      },
      select: { id: true },
    });

    return found !== null;
  }

  /** Categoría utilizable en el formulario: existe y está activa. */
  async findActiveCategory(categoryId: string): Promise<ReferenceOption | null> {
    return prisma.category.findFirst({
      where: { id: categoryId, isActive: true },
      select: referenceSelection,
    });
  }

  /** Proveedor utilizable: existe y está activo. */
  async findActiveSupplier(supplierId: string): Promise<ReferenceOption | null> {
    return prisma.supplier.findFirst({
      where: { id: supplierId, isActive: true },
      select: referenceSelection,
    });
  }

  /** Categorías activas para el `<select>` del formulario. */
  async listActiveCategories(): Promise<ReferenceOption[]> {
    return prisma.category.findMany({
      where: { isActive: true },
      select: referenceSelection,
      orderBy: { name: 'asc' },
    });
  }

  /** Proveedores activos para el `<select>` del formulario. */
  async listActiveSuppliers(): Promise<ReferenceOption[]> {
    return prisma.supplier.findMany({
      where: { isActive: true },
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

    return readProduct(productId);
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
      await tx.product.update({
        where: { id },
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

    return readProduct(id);
  }

  /**
   * Baja lógica del producto (HU-03): solo `isActive = false`.
   *
   * No se borra ninguna fila: `Product` sigue referenciado por `SaleItem`,
   * `InventoryMovement`, `SupplierProduct` y `PurchaseOrderItem`, y esas ventas
   * históricas deben seguir existiendo para los reportes.
   */
  async deactivate(id: string): Promise<ProductDto> {
    await prisma.product.update({ where: { id }, data: { isActive: false } });

    return readProduct(id);
  }
}
