import { z } from 'zod';

/**
 * Esquemas Zod del recurso inventario (HU-10).
 *
 * Igual que en productos, son la fuente de verdad de lo que acepta la API: un
 * incumplimiento se convierte en `400` con el detalle por campo (ver
 * `middleware/error-handler.middleware.ts`).
 */

/** Tope del conteo: el mismo que el stock de productos, para no desbordar la columna `Int`. */
const MAX_COUNTED_QUANTITY = 1_000_000;

/**
 * Cuerpo de `POST /api/inventory/counts` (HU-10).
 *
 * HU-10 pide indicar el producto y la cantidad contada físicamente, y rechazar
 * una cantidad negativa pidiendo corregirla.
 */
export const createInventoryCountSchema = z.object({
  productId: z.uuid({ error: 'Debe seleccionar un producto.' }),
  countedQuantity: z
    .number({ error: 'La cantidad contada debe ser un número.' })
    .int('La cantidad contada debe ser un número entero.')
    .min(0, 'La cantidad contada no puede ser negativa. Corríjala e intente de nuevo.')
    .max(MAX_COUNTED_QUANTITY, `La cantidad contada no puede superar ${MAX_COUNTED_QUANTITY}.`),
});

/** Entrada ya validada del registro de un conteo. */
export type CreateInventoryCountInput = z.infer<typeof createInventoryCountSchema>;
