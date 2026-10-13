import { z } from 'zod';

/** Esquemas Zod del recurso categorías (HU-04). */

const nameSchema = z
  .string({ error: 'El nombre es obligatorio.' })
  .trim()
  .min(1, 'El nombre no puede estar vacío.')
  .max(80, 'El nombre no puede superar 80 caracteres.');

/** Descripción opcional: vacía o ausente se guarda como `null`. */
const descriptionSchema = z
  .string({ error: 'La descripción debe ser texto.' })
  .trim()
  .max(255, 'La descripción no puede superar 255 caracteres.')
  .nullish()
  .transform((value) => (value === undefined || value === null || value === '' ? null : value));

/** Cuerpo de `POST /api/categories`. */
export const createCategorySchema = z.object({
  name: nameSchema,
  description: descriptionSchema,
});

/** Entrada ya validada y normalizada de la creación. */
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
