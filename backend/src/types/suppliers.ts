/**
 * Contratos del módulo de proveedores (HU-21).
 *
 * El dinero viaja como cadena con dos decimales (`"1500.00"`), igual que en
 * productos.
 */
import type { MoneyString } from './products.js';

/** Producto que suministra un proveedor, con el costo al que se le compra. */
export interface SupplierProductDto {
  productId: string;
  productCode: string;
  productName: string;
  unitCost: MoneyString;
  /** `true` si este proveedor es el principal del producto (lo define HU-01/HU-02). */
  isPreferred: boolean;
}

/** Proveedor tal como lo expone la API. */
export interface SupplierDto {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  products: SupplierProductDto[];
}

/** Producto que se asocia al proveedor desde el formulario. */
export interface SupplierProductFields {
  productId: string;
  unitCost: MoneyString;
}

/**
 * Campos que envía el formulario de proveedor. Es la entrada del registro y de
 * la edición (HU-21 permite editar toda la información del proveedor).
 */
export interface SupplierWritableFields {
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  products: SupplierProductFields[];
}

/** Costo de un proveedor para un producto, tal como lo lee el repositorio (HU-39). */
export interface SupplierCostRow {
  supplierId: string;
  supplierName: string;
  /** Costo con dos decimales, `"4850.00"`. */
  unitCost: string;
  isPreferred: boolean;
  /** Cuándo se registró ese costo por última vez. */
  updatedAt: Date;
}

/** Un proveedor en la comparación, del más barato al más caro (HU-39). */
export interface SupplierCostDto {
  supplierId: string;
  supplierName: string;
  unitCost: string;
  /** Es el proveedor principal del producto. */
  isPreferred: boolean;
  /** Es el más barato (o empata con el más barato). */
  cheapest: boolean;
  /** Cuánto más cuesta que el más barato, `"120.00"`; `"0.00"` si es el más barato. */
  difference: string;
  /** Cuándo se registró ese costo (ISO 8601): la comparación usa siempre el último. */
  updatedAt: string;
}

/** Comparación de costos de un producto entre sus proveedores activos (HU-39). */
export interface ProductSupplierCostsDto {
  product: { id: string; code: string; name: string };
  suppliers: SupplierCostDto[];
}
