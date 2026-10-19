import { z } from 'zod';
import { isMoney } from '../utils/money.js';

/** Esquemas Zod de ventas (HU-16, HU-17, HU-18). */

export const MAX_LINE_QUANTITY = 9999;
export const MAX_SALE_LINES = 100;

const paymentMethodSchema = z.enum(['CASH', 'CARD', 'CREDIT'], {
  error: 'Seleccione el método de pago: efectivo, tarjeta o fiado.',
});

/**
 * Código leído por el lector (o escrito a mano): letras, números y `. _ -`.
 * Un lector de teclado puede colar espacios, saltos o símbolos raros; eso no es
 * un código.
 */
export const productCodeSchema = z
  .string({ error: 'El código es obligatorio.' })
  .trim()
  .min(1, 'El código es obligatorio.')
  .max(64, 'El código no puede superar 64 caracteres.')
  .regex(
    /^[A-Za-z0-9._-]+$/,
    'El código solo puede tener letras, números, punto, guion y guion bajo.',
  );

/** Query de `GET /api/sales/lookup`. */
export const lookupQuerySchema = z.object({ code: productCodeSchema });

const lineSchema = z.object({
  productId: z.uuid({ error: 'El producto indicado no es válido.' }),
  quantity: z
    .number({ error: 'La cantidad debe ser un número.' })
    .int('La cantidad debe ser un número entero.')
    .min(1, 'La cantidad mínima es 1.')
    .max(MAX_LINE_QUANTITY, `La cantidad máxima por producto es ${MAX_LINE_QUANTITY}.`),
});

/**
 * Cuerpo de `POST /api/sales`. NO lleva precios ni total: los calcula el
 * servidor con los precios vigentes (HU-16).
 */
export const createSaleSchema = z.object({
  /** Llave de este intento de cobro: evita ventas duplicadas por reintento. */
  idempotencyKey: z.uuid({ error: 'La llave de la venta no es válida.' }),
  items: z
    .array(lineSchema, { error: 'La venta necesita al menos un producto.' })
    .min(1, 'La venta necesita al menos un producto.')
    .max(MAX_SALE_LINES, `Una venta admite hasta ${MAX_SALE_LINES} productos distintos.`),
  paymentMethod: paymentMethodSchema,
  /** Efectivo recibido: solo con `CASH`. */
  cashReceived: z.string().refine(isMoney, 'El monto recibido no es válido.').optional(),
  /** Cliente: obligatorio con `CREDIT`. */
  customerId: z.uuid({ error: 'El cliente indicado no es válido.' }).optional(),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;

/** Query de `GET /api/sales` (historial mínimo, HU-17). */
export const saleListQuerySchema = z.object({
  paymentMethod: paymentMethodSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const saleIdParamSchema = z.object({
  id: z.uuid({ error: 'La venta indicada no es válida.' }),
});
