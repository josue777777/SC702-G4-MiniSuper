/**
 * Contratos del módulo de productos (HU-01, HU-02, HU-03).
 *
 * Viven separados del resto de capas porque los comparten el repository (los
 * devuelve), el service (los arma) y el controller (los publica en el JSON).
 * El frontend mantiene su propia copia en `frontend/src/types/products.ts`,
 * igual que se hizo con los tipos de `/api/health`.
 *
 * Convención de dinero: todo importe viaja como cadena con dos decimales
 * (`"1500.00"`) porque en la base es `Decimal(12, 2)` y el tipo `number` de
 * JavaScript no representa esos valores con exactitud.
 */

/** Importe monetario normalizado: cadena con dos decimales, por ejemplo `"1500.00"`. */
export type MoneyString = string;

/**
 * Tipo de movimiento de inventario. Son los mismos literales del enum
 * `InventoryMovementType` de Prisma, repetidos aquí para que el service pueda
 * decidir el movimiento sin importar el cliente de Prisma (solo los
 * repositories hablan con Prisma).
 */
export type InventoryMovementKind = 'ENTRY' | 'EXIT' | 'ADJUSTMENT';

/**
 * Movimiento de inventario que el service decide y el repository persiste
 * dentro de la misma transacción que el cambio de stock.
 *
 * `quantity` es siempre positiva: el signo se interpreta según `type`, tal como
 * está documentado en el esquema. `stockBefore`/`stockAfter` son lo que permite
 * reconstruir el historial (HU-10).
 */
export interface InventoryMovementPlan {
  type: InventoryMovementKind;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  reason: string;
}

/**
 * Producto tal como lo expone la API.
 *
 * Los nombres de categoría y de proveedor principal se incluyen ya resueltos
 * para que la tabla de la pantalla no tenga que cruzar datos por su cuenta; el
 * repositorio es el único que conoce las relaciones de Prisma.
 */
export interface ProductDto {
  id: string;
  code: string;
  barcode: string | null;
  name: string;
  categoryId: string;
  categoryName: string;
  price: MoneyString;
  cost: MoneyString;
  stock: number;
  isActive: boolean;
  /** Proveedor principal: el `SupplierProduct` con `isPreferred = true`. */
  preferredSupplierId: string | null;
  preferredSupplierName: string | null;
  /** Mínimo que dispara la alerta de stock bajo (HU-08); 0 = sin mínimo. */
  minStock: number;
  /** Fecha de vencimiento `YYYY-MM-DD` (HU-09), o `null` si no vence. */
  expirationDate: string | null;
  /**
   * URL de la imagen (HU-01), o `null` si no tiene. Lleva `?v=` con la fecha del
   * cambio para que el navegador no muestre una imagen vieja de su caché.
   */
  imageUrl: string | null;
}

/** Formatos de imagen aceptados. Sin SVG: puede llevar código (XSS). */
export const PRODUCT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type ProductImageMimeType = (typeof PRODUCT_IMAGE_TYPES)[number];

/** Imagen guardada de un producto (HU-01). */
export interface ProductImage {
  data: Uint8Array;
  mimeType: ProductImageMimeType;
}

/** Criterios con los que el service le pide al repositorio el listado. */
export interface ProductListFilter {
  categoryId?: string;
  /**
   * Búsqueda de HU-05: coincide con un fragmento del nombre o del código, en
   * ambos casos sin distinguir mayúsculas de minúsculas.
   */
  search?: string;
  /** Si es `true`, excluye los productos inactivos. */
  activeOnly?: boolean;
}

/** Opción de un `<select>` de los formularios de producto. */
export interface ReferenceOption {
  id: string;
  name: string;
}

/**
 * Datos de apoyo de los formularios (`GET /api/products/form-options`).
 * Solo se listan categorías y proveedores ACTIVOS. Las categorías se crean con
 * `POST /api/categories` (HU-04); el CRUD de proveedores es HU-21.
 */
export interface ProductFormOptionsDto {
  categories: ReferenceOption[];
  suppliers: ReferenceOption[];
}

/**
 * Campos que envía el formulario: exactamente los siete de HU-01. Es la entrada
 * tanto de la creación como de la edición, porque HU-02 permite modificar todos
 * los campos del producto.
 */
export interface ProductWritableFields {
  code: string;
  name: string;
  categoryId: string;
  price: MoneyString;
  cost: MoneyString;
  stock: number;
  supplierId: string;
}

/** Trabajo que el service encarga al repositorio al crear un producto. */
export interface CreateProductPlan {
  fields: ProductWritableFields;
  /** Movimiento ENTRY del stock inicial, o `null` si el stock inicial es 0. */
  initialMovement: InventoryMovementPlan | null;
}

/** Trabajo que el service encarga al repositorio al editar un producto. */
export interface UpdateProductPlan {
  fields: ProductWritableFields;
  /** Ajuste de stock, o `null` si el stock no cambió. */
  stockMovement: InventoryMovementPlan | null;
}

/** Documentos de otros módulos que mencionan al producto: impiden borrarlo (HU-03). */
export interface ProductReferences {
  sales: number;
  purchaseOrders: number;
}
