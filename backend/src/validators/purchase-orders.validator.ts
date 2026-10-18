import { z } from 'zod';
import type { PurchaseOrderFields } from '../types/purchase-orders.js';

/**
 * Esquemas Zod de los pedidos a proveedor (HU-22, HU-24).
 *
 * El costo no viaja en el cuerpo: lo pone el service con el costo acordado con
 * el proveedor (HU-21), para que el pedido no dependa de lo que escriba el dueño.
 */

/** Tope por línea: el mismo que el stock, para no desbordar la columna `Int`. */
const MAX_QUANTITY = 1_000_000;

const itemSchema = z.object({
  productId: z.uuid({ error: 'Seleccione un producto válido.' }),
  quantity: z
    .number({ error: 'La cantidad debe ser un número.' })
    .int('La cantidad debe ser un número entero.')
    .min(1, 'La cantidad debe ser al menos 1.')
    .max(MAX_QUANTITY, `La cantidad no puede superar ${MAX_QUANTITY}.`),
});

/** Cuerpo de `POST /api/purchase-orders` (HU-24). */
export const createPurchaseOrderSchema = z
  .object({
    supplierId: z.uuid({ error: 'Seleccione un proveedor.' }),
    notes: z
      .string({ error: 'Las notas deben ser texto.' })
      .trim()
      .max(500, 'Las notas no pueden superar 500 caracteres.')
      .nullish()
      .transform((value) => (value === undefined || value === null || value === '' ? null : value)),
    // HU-24: un pedido sin productos no se puede generar.
    items: z
      .array(itemSchema, { error: 'Agregue los productos del pedido.' })
      .min(1, 'Agregue al menos un producto al pedido.'),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.items.forEach((item, index) => {
      if (seen.has(item.productId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'productId'],
          message: 'El producto está repetido en el pedido.',
        });
      }
      seen.add(item.productId);
    });
  });

/** Query de `GET /api/purchase-orders`: filtro opcional por proveedor (HU-22). */
export const listPurchaseOrdersQuerySchema = z.object({
  supplierId: z.uuid({ error: 'El proveedor indicado no es válido.' }).optional(),
});

/** Parámetro `:id` del detalle. */
export const purchaseOrderIdParamSchema = z.object({
  id: z.uuid({ error: 'El pedido indicado no es válido.' }),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type ListPurchaseOrdersQuery = z.infer<typeof listPurchaseOrdersQuerySchema>;

/** Comprobación en tiempo de compilación contra `types/purchase-orders.ts`. */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const _contractCheck: Exact<CreatePurchaseOrderInput, PurchaseOrderFields> = true;
