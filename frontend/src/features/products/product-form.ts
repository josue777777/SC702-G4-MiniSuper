import type { Product, ProductFormValues, ProductPayload } from '../../types/products';

/**
 * Conversión y validación del formulario de producto.
 *
 * Son funciones puras, sin React: el componente se limita a pintar `values` y
 * `errors`. Tenerlas aparte también deja claro dónde termina la ayuda de
 * experiencia de usuario y dónde empieza la validación obligatoria del backend.
 */

/** Formulario vacío: es como abre «+ Nuevo producto». */
export const EMPTY_FORM_VALUES: ProductFormValues = {
  code: '',
  name: '',
  categoryId: '',
  price: '',
  cost: '',
  stock: '0',
  supplierId: '',
};

/**
 * Precarga del formulario de edición (HU-02).
 *
 * Se toman los valores PERSISTIDOS del producto: el formulario nunca parte del
 * estado anterior de la pantalla, así que cancelar una edición no puede dejar
 * restos de lo que se escribió.
 */
export function toFormValues(product: Product): ProductFormValues {
  return {
    code: product.code,
    name: product.name,
    categoryId: product.categoryId,
    price: product.price,
    cost: product.cost,
    stock: String(product.stock),
    supplierId: product.preferredSupplierId ?? '',
  };
}

/**
 * Cuerpo de la petición a partir del formulario. El stock pasa a número (el
 * backend lo exige entero) y el dinero se manda como cadena, que el backend
 * normaliza a dos decimales.
 */
export function toPayload(values: ProductFormValues): ProductPayload {
  const stock = values.stock.trim();

  return {
    code: values.code.trim(),
    name: values.name.trim(),
    categoryId: values.categoryId,
    price: values.price.trim(),
    cost: values.cost.trim(),
    stock: stock === '' ? 0 : Number(stock),
    supplierId: values.supplierId,
  };
}

/** Errores por campo. Un objeto vacío significa "se puede enviar". */
export type FormErrors = Partial<Record<keyof ProductFormValues, string>>;

/** Valida un importe escrito a mano: vacío, no numérico, negativo o con céntimos de más. */
function validateMoney(value: string, label: string): string | undefined {
  const trimmed = value.trim();

  if (trimmed === '') {
    return `Escriba el ${label}.`;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return `El ${label} debe ser un número mayor o igual a 0, con máximo dos decimales.`;
  }

  return undefined;
}

/**
 * Validación de experiencia de usuario.
 *
 * NO sustituye a la del backend, que sigue siendo la fuente de verdad; solo
 * evita el viaje de ida y vuelta cuando el problema se ve a simple vista.
 */
export function validateForm(values: ProductFormValues): FormErrors {
  const errors: FormErrors = {};

  if (values.code.trim() === '') {
    errors.code = 'Escriba el código del producto.';
  }

  if (values.name.trim() === '') {
    errors.name = 'Escriba el nombre del producto.';
  }

  if (values.categoryId === '') {
    errors.categoryId = 'Seleccione una categoría.';
  }

  if (values.supplierId === '') {
    errors.supplierId = 'Seleccione un proveedor.';
  }

  const priceError = validateMoney(values.price, 'precio');
  if (priceError !== undefined) {
    errors.price = priceError;
  }

  const costError = validateMoney(values.cost, 'costo');
  if (costError !== undefined) {
    errors.cost = costError;
  }

  const stock = values.stock.trim();
  if (stock === '') {
    errors.stock = 'Indique la cantidad en existencia.';
  } else if (!/^\d+$/.test(stock)) {
    errors.stock = 'El stock debe ser un número entero mayor o igual a 0.';
  }

  return errors;
}

/** `true` si la validación encontró algo. */
export function hasErrors(errors: FormErrors): boolean {
  return Object.keys(errors).length > 0;
}
