/** Contratos del módulo de categorías en el frontend (HU-04); copia de `backend/src/types/categories.ts`. */

export interface Category {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

/** Cuerpo que acepta `POST /api/categories`. */
export interface CategoryPayload {
  name: string;
  description: string;
}
