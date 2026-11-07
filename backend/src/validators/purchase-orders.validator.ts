import { z } from 'zod';
import type { PurchaseOrderFields, ReceiveOrderFields } from '../types/purchase-orders.js';
import { INVOICE_FILE_TYPES, MAX_INVOICE_FILE_BYTES } from '../utils/invoice-file.js';

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

/** Parámetros `:id` y `:receiptId` de una entrega. */
export const receiptParamsSchema = z.object({
  id: z.uuid({ error: 'El pedido indicado no es válido.' }),
  receiptId: z.uuid({ error: 'La entrega indicada no es válida.' }),
});

/**
 * Cuerpo de `POST /api/purchase-orders/:id/receipts` (HU-38): la factura, el
 * día real en que llegó y lo que llegó de cada producto. Que no llegue más de
 * lo pendiente ni con fecha futura lo revisa el service, que conoce el pedido.
 */
export const receiveOrderSchema = z
  .object({
    invoiceNumber: z
      .string({ error: 'Indique el número de factura.' })
      .trim()
      .min(1, 'Indique el número de factura.')
      .max(40, 'El número de factura no puede superar 40 caracteres.'),
    receivedOn: z.iso.date({ error: 'Indique la fecha en que llegó (AAAA-MM-DD).' }),
    loadNow: z.boolean({ error: 'Indique si se carga ya al inventario.' }),
    items: z
      .array(
        z.object({
          productId: z.uuid({ error: 'Seleccione un producto válido.' }),
          quantity: z
            .number({ error: 'La cantidad debe ser un número.' })
            .int('La cantidad debe ser un número entero.')
            .min(0, 'La cantidad no puede ser negativa.')
            .max(MAX_QUANTITY, `La cantidad no puede superar ${MAX_QUANTITY}.`),
        }),
        { error: 'Indique lo que llegó.' },
      )
      .min(1, 'Indique lo que llegó.'),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();

    value.items.forEach((item, index) => {
      if (seen.has(item.productId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'productId'],
          message: 'El producto está repetido.',
        });
      }
      seen.add(item.productId);
    });

    if (value.items.every((item) => item.quantity === 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'Anote al menos un producto que haya llegado.',
      });
    }
  });

/**
 * Factura del proveedor adjunta a una entrega (HU-38): tipo de la cabecera
 * `Content-Type`, bytes del cuerpo y nombre de `X-File-Name`. Que los bytes sean
 * de ese tipo lo revisa el service mirando la firma.
 */
export const receiptInvoiceSchema = z.object({
  mimeType: z.enum(INVOICE_FILE_TYPES, {
    error: 'Solo se aceptan facturas en PDF o en imagen (PNG, JPG o WEBP).',
  }),
  name: z.string(),
  data: z
    .instanceof(Uint8Array, { error: 'Adjunte el archivo de la factura.' })
    .refine((data) => data.length > 0, 'Adjunte el archivo de la factura.')
    .refine(
      (data) => data.length <= MAX_INVOICE_FILE_BYTES,
      'La factura supera el máximo de 5 MB.',
    ),
});

export type ReceiptInvoiceInput = z.infer<typeof receiptInvoiceSchema>;

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type ReceiveOrderInput = z.infer<typeof receiveOrderSchema>;
export type ListPurchaseOrdersQuery = z.infer<typeof listPurchaseOrdersQuerySchema>;

/** Comprobación en tiempo de compilación contra `types/purchase-orders.ts`. */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const _contractCheck: Exact<CreatePurchaseOrderInput, PurchaseOrderFields> = true;
const _receiveContractCheck: Exact<ReceiveOrderInput, ReceiveOrderFields> = true;
