/**
 * Contratos del módulo de proveedores en el frontend (HU-21). Copia de
 * `backend/src/types/suppliers.ts`; el dinero viaja como cadena (`"700.00"`).
 */

export interface SupplierProduct {
  productId: string;
  productCode: string;
  productName: string;
  unitCost: string;
  /** Proveedor principal del producto (se elige en el formulario de productos). */
  isPreferred: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  products: SupplierProduct[];
}

/** Cuerpo que acepta la API al registrar y al editar un proveedor. */
export interface SupplierPayload {
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  products: { productId: string; unitCost: string }[];
}

/** Fila de producto en el formulario: todo texto, como lo devuelven los controles. */
export interface SupplierProductRow {
  productId: string;
  unitCost: string;
}

/** Estado del formulario de proveedor. */
export interface SupplierFormValues {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  products: SupplierProductRow[];
}

/** Un proveedor en la comparación de costos, del más barato al más caro (HU-39). */
export interface SupplierCost {
  supplierId: string;
  supplierName: string;
  /** Costo con dos decimales, `"4850.00"`. */
  unitCost: string;
  isPreferred: boolean;
  /** Es el más barato (o empata con él). */
  cheapest: boolean;
  /** Cuánto más cuesta que el más barato, `"120.00"`. */
  difference: string;
  /** Cuándo se registró ese costo (ISO 8601). */
  updatedAt: string;
}

/** Comparación de costos de un producto entre sus proveedores activos (HU-39). */
export interface ProductSupplierCosts {
  product: { id: string; code: string; name: string };
  suppliers: SupplierCost[];
}
