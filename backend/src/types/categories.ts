/** Contratos del módulo de categorías (HU-04). */

/** Categoría tal como la expone la API. */
export interface CategoryDto {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

/** Campos que envía el formulario de alta. */
export interface CategoryWritableFields {
  name: string;
  description: string | null;
}
