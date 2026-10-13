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
