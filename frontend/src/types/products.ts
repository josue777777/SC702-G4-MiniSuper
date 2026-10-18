/**
 * Contratos del módulo de productos en el frontend (HU-01, HU-02, HU-03).
 *
 * Son la copia de lo que publica el backend (`backend/src/types/products.ts`).
 * Se declaran a mano por la misma razón que el resto de `src/types/`: Vite no
 * puede importar código de `backend/src`.
 *
 * Convención de dinero: el importe viaja y se guarda como cadena con dos
 * decimales (`"1500.00"`), nunca como `number`, porque en la base es
 * `Decimal(12, 2)`. El formateo para mostrarlo vive en `features/products/money.ts`.
 */

/** Producto tal como lo devuelve la API. */
export interface Product {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  categoryName: string;
  price: string;
  cost: string;
  stock: number;
  isActive: boolean;
  preferredSupplierId: string | null;
  preferredSupplierName: string | null;
  /** Mínimo que dispara la alerta de stock bajo (HU-08); 0 = sin mínimo. */
  minStock: number;
  /** Fecha de vencimiento `YYYY-MM-DD` (HU-09), o `null` si no vence. */
  expirationDate: string | null;
  /** Ruta de la imagen en la API (HU-01), o `null` si no tiene. */
  imageUrl: string | null;
}

/** Formatos de imagen que acepta la API (sin SVG, que puede llevar código). */
export const PRODUCT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Tamaño máximo de la imagen: 2 MB, igual que en el backend. */
export const MAX_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024;

/** Qué hacer con la imagen al guardar el formulario (HU-01). */
export type ProductImageChange =
  { kind: 'keep' } | { kind: 'set'; file: File } | { kind: 'remove' };

/** Opción de un `<select>` (categoría o proveedor). */
export interface ReferenceOption {
  id: string;
  name: string;
}

/** Datos de apoyo de los formularios (`GET /api/products/form-options`). */
export interface ProductFormOptions {
  categories: ReferenceOption[];
  suppliers: ReferenceOption[];
}

/**
 * Filtros de `GET /api/products`. Con cualquiera de los dos el backend devuelve
 * solo productos activos; sin ninguno, el catálogo completo.
 */
export interface ProductListParams {
  categoryId?: string;
  /** Búsqueda de HU-05: fragmento del nombre o del código. */
  search?: string;
}

/** Cuerpo que acepta la API al crear (HU-01) y al editar (HU-02). */
export interface ProductPayload {
  code: string;
  name: string;
  categoryId: string;
  price: string;
  cost: string;
  /** El stock viaja como número; el backend exige un entero ≥ 0. */
  stock: number;
  supplierId: string;
}

/**
 * Estado del formulario. Todo es `string` porque es lo que devuelven los
 * controles HTML; la conversión al `ProductPayload` la hace
 * `features/products/product-form.ts`.
 */
export interface ProductFormValues {
  code: string;
  name: string;
  categoryId: string;
  price: string;
  cost: string;
  stock: string;
  supplierId: string;
}

/**
 * Mínimo y vencimiento que cambiaron en el formulario (HU-08, HU-09). Solo
 * trae lo que cambió; se guarda con los endpoints de inventario.
 */
export interface ProductSettingsChange {
  minStock?: number;
  expirationDate?: string | null;
}
