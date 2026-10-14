import { z } from 'zod';
import type {
  ExpirationDateFields,
  InventoryCountFields,
  MinStockFields,
} from '../types/inventory.js';

/**
 * Esquemas Zod del recurso inventario (HU-08, HU-09, HU-10).
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

/** Parámetro `:id` de las rutas de configuración de un producto. */
export const inventoryProductIdParamSchema = z.object({
  id: z.uuid({ error: 'El producto indicado no es válido.' }),
});

/** Cuerpo de `PATCH /api/inventory/products/:id/min-stock` (HU-08). 0 = sin mínimo. */
export const updateMinStockSchema = z.object({
  minStock: z
    .number({ error: 'El stock mínimo debe ser un número.' })
    .int('El stock mínimo debe ser un número entero.')
    .min(0, 'El stock mínimo no puede ser negativo.')
    .max(MAX_COUNTED_QUANTITY, `El stock mínimo no puede superar ${MAX_COUNTED_QUANTITY}.`),
});

/**
 * Cuerpo de `PATCH /api/inventory/products/:id/expiration-date` (HU-09).
 *
 * La fecha es opcional (`null` = el producto no vence). Aquí solo se valida el
 * formato; que sea futura lo decide el service, porque depende del día de hoy.
 */
export const updateExpirationDateSchema = z.object({
  expirationDate: z.iso
    .date({ error: 'La fecha de vencimiento no es válida (formato AAAA-MM-DD).' })
    .nullable(),
});

/** Entrada ya validada del registro de un conteo. */
export type CreateInventoryCountInput = z.infer<typeof createInventoryCountSchema>;

/**
 * Comprobación en tiempo de compilación: si el esquema y el contrato de
 * `types/inventory.ts` se separan, `npm run typecheck` falla y lo avisa.
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const _contractCheck: Exact<CreateInventoryCountInput, InventoryCountFields> = true;

/** Entrada ya validada del mínimo de stock (HU-08). */
export type UpdateMinStockInput = z.infer<typeof updateMinStockSchema>;

/** Entrada ya validada de la fecha de vencimiento (HU-09). */
export type UpdateExpirationDateInput = z.infer<typeof updateExpirationDateSchema>;

const _minStockContractCheck: Exact<UpdateMinStockInput, MinStockFields> = true;
const _expirationContractCheck: Exact<UpdateExpirationDateInput, ExpirationDateFields> = true;
