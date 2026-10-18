import type {
  Supplier,
  SupplierFormValues,
  SupplierPayload,
  SupplierProductRow,
} from '../../types/suppliers';

/**
 * Conversión y validación del formulario de proveedor (HU-21), sin React.
 * Es ayuda de experiencia de usuario: quien decide es el backend.
 */

export const EMPTY_PRODUCT_ROW: SupplierProductRow = { productId: '', unitCost: '' };

export const EMPTY_SUPPLIER_VALUES: SupplierFormValues = {
  name: '',
  contactName: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
  // Al registrar no se piden productos: se asocian desde Inventario o al editar.
  products: [],
};

/** Precarga de la edición a partir de lo guardado. */
export function toSupplierFormValues(supplier: Supplier): SupplierFormValues {
  return {
    name: supplier.name,
    contactName: supplier.contactName ?? '',
    phone: supplier.phone ?? '',
    email: supplier.email ?? '',
    address: supplier.address ?? '',
    notes: supplier.notes ?? '',
    products: supplier.products.map((product) => ({
      productId: product.productId,
      unitCost: product.unitCost,
    })),
  };
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

/**
 * Filas con algo escrito. Una fila totalmente vacía no cuenta: el proveedor
 * puede registrarse sin productos y asociarlos después.
 */
function filledRows(rows: SupplierProductRow[]): SupplierProductRow[] {
  return rows.filter((row) => row.productId !== '' || row.unitCost.trim() !== '');
}

export function toSupplierPayload(values: SupplierFormValues): SupplierPayload {
  return {
    name: values.name.trim(),
    contactName: textOrNull(values.contactName),
    phone: textOrNull(values.phone),
    email: textOrNull(values.email),
    address: textOrNull(values.address),
    notes: textOrNull(values.notes),
    products: filledRows(values.products).map((row) => ({
      productId: row.productId,
      unitCost: row.unitCost.trim(),
    })),
  };
}

export interface SupplierFormErrors {
  name?: string;
  contact?: string;
  email?: string;
  products?: string;
}

export function validateSupplierForm(values: SupplierFormValues): SupplierFormErrors {
  const errors: SupplierFormErrors = {};

  if (values.name.trim() === '') {
    errors.name = 'Escriba el nombre del proveedor.';
  }

  if (values.phone.trim() === '' && values.email.trim() === '') {
    errors.contact = 'Indique al menos un dato de contacto: teléfono o correo.';
  }

  if (values.email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'El correo no es válido.';
  }

  const rows = filledRows(values.products);
  const chosen = rows.map((row) => row.productId);

  if (chosen.some((productId) => productId === '')) {
    errors.products = 'Seleccione el producto de cada fila con costo, o deje la fila vacía.';
  } else if (new Set(chosen).size !== chosen.length) {
    errors.products = 'Hay un producto repetido en la lista.';
  } else if (rows.some((row) => !/^\d+(\.\d{1,2})?$/.test(row.unitCost.trim()))) {
    errors.products = 'El costo de cada producto debe ser un número ≥ 0 con máximo dos decimales.';
  }

  return errors;
}

export function hasSupplierErrors(errors: SupplierFormErrors): boolean {
  return Object.keys(errors).length > 0;
}
