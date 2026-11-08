import { z } from 'zod';
import type { KardexEntryFields, KardexExitFields } from '../types/kardex.js';
import { EXIT_CONCEPTS } from '../types/kardex.js';

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
    direction: z
      .enum(['all', 'entries', 'exits'], { error: 'El filtro debe ser all, entries o exits.' })
      .default('all'),
  })
  .strict();

/** Tope por movimiento: el mismo que el stock. */
const MAX_QUANTITY = 1_000_000;

const quantitySchema = z
  .number({ error: 'La cantidad debe ser un número.' })
  .int('La cantidad debe ser un número entero.')
  .min(1, 'La cantidad debe ser mayor que 0.')
  .max(MAX_QUANTITY, `La cantidad no puede superar ${MAX_QUANTITY}.`);

const documentSchema = (label: string) =>
  z
    .string({ error: `Indique el ${label}.` })
    .trim()
    .min(1, `Indique el ${label}.`)
    .max(40, `El ${label} no puede superar 40 caracteres.`);

/**
 * Cuerpo de `POST /api/kardex/products/:productId/entries` (HU-38): ingreso
 * SIN pedido, una compra directa al proveedor. Sin referencia (factura) o con
 * unidades ≤ 0 no se guarda. Que los lotes cuadren lo revisa el service, que
 * sabe si el producto vence.
 */
export const kardexEntrySchema = z.object({
  supplierId: z.uuid({ error: 'Elija el proveedor.' }),
  invoiceNumber: documentSchema('número de factura'),
  documentDate: z.iso.date({ error: 'Indique la fecha de la factura (AAAA-MM-DD).' }),
  quantity: quantitySchema,
  unitCost: z
    .string({ error: 'Indique el costo unitario.' })
    .trim()
    .regex(
      /^\d{1,10}(\.\d{1,2})?$/,
      'El costo unitario debe ser un monto válido (hasta 2 decimales).',
    ),
  lots: z
    .array(
      z.object({
        lotNumber: z.string().trim().max(40, 'El número de lote no puede superar 40 caracteres.'),
        expirationDate: z.iso
          .date({ error: 'Indique la fecha de vencimiento (AAAA-MM-DD).' })
          .nullable(),
        quantity: quantitySchema,
      }),
    )
    .max(20, 'Un ingreso no puede venir en más de 20 lotes.')
    .optional(),
});

/** Cuerpo de `POST /api/kardex/products/:productId/exits` (HU-38): egreso de un lote. */
export const kardexExitSchema = z.object({
  concept: z.enum(Object.keys(EXIT_CONCEPTS) as [keyof typeof EXIT_CONCEPTS], {
    error: 'Elija el concepto del egreso.',
  }),
  documentNumber: documentSchema('número de documento'),
  lotId: z.uuid({ error: 'Elija el lote del que sale.' }),
  quantity: quantitySchema,
  detail: z.string().trim().max(200, 'El detalle no puede superar 200 caracteres.').optional(),
});

export type KardexEntryInput = z.infer<typeof kardexEntrySchema>;
export type KardexExitInput = z.infer<typeof kardexExitSchema>;

/** Comprobación en tiempo de compilación contra `types/kardex.ts`. */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const _entryContractCheck: Exact<KardexEntryInput, KardexEntryFields> = true;
const _exitContractCheck: Exact<KardexExitInput, KardexExitFields> = true;
