import { z } from 'zod';

/** Esquemas Zod del Kardex (HU-31). Un incumplimiento responde `400` con el detalle por campo. */

export const DEFAULT_MOVEMENTS_PAGE_SIZE = 15;
export const MAX_MOVEMENTS_PAGE_SIZE = 100;

/** Tope de la página: mantiene el `skip` dentro del rango del entero de la base. */
const MAX_PAGE = 100_000;

/** Parámetro `:productId` de las rutas de la ficha. */
export const kardexProductParamSchema = z.object({
  productId: z.uuid({ error: 'El producto indicado no es válido.' }),
});

/** Filtro del selector de producto: nombre o código. Sin filtro lista los primeros. */
export const kardexSearchQuerySchema = z
  .object({
    search: z.string().trim().max(120, 'La búsqueda no puede superar 120 caracteres.').optional(),
  })
  .strict();

/**
 * Paginación del historial. Con `.strict()` un parámetro desconocido se rechaza en
 * lugar de ignorarse (la pantalla mostraría algo distinto de lo pedido).
 */
export const kardexMovementsQuerySchema = z
  .object({
    page: z.coerce
      .number({ error: 'La página debe ser un número.' })
      .int('La página debe ser un número entero.')
      .min(1, 'La página mínima es 1.')
      .max(MAX_PAGE, `La página máxima es ${MAX_PAGE}.`)
      .default(1),
    pageSize: z.coerce
      .number({ error: 'El tamaño de página debe ser un número.' })
      .int('El tamaño de página debe ser un número entero.')
      .min(1, 'El tamaño de página mínimo es 1.')
      .max(MAX_MOVEMENTS_PAGE_SIZE, `El tamaño de página máximo es ${MAX_MOVEMENTS_PAGE_SIZE}.`)
      .default(DEFAULT_MOVEMENTS_PAGE_SIZE),
  })
  .strict();
