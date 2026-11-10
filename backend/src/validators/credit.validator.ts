import { z } from 'zod';
import { isMoney, toCents } from '../utils/money.js';

/** Esquemas Zod de las cuentas por cobrar y los abonos (HU-19). */

export const MAX_PAYMENT_NOTE_LENGTH = 200;

/** Parámetro `:id` del cliente. */
export const customerIdParamSchema = z.object({
  id: z.uuid({ error: 'El cliente indicado no es válido.' }),
});

/** Monto del abono: texto con hasta dos decimales, sin signo y mayor que cero. */
const amountSchema = z
  .string({ error: 'El monto es obligatorio.' })
  .trim()
  .min(1, 'El monto es obligatorio.')
  .refine(isMoney, 'El monto debe ser un importe válido, sin signo y con hasta dos decimales.')
  .refine((value) => !isMoney(value) || toCents(value) > 0n, 'El monto debe ser mayor que cero.');

/**
 * Cuerpo de `POST /api/customers/:id/payments`. NO lleva negocio ni usuario: salen
 * de la sesión. La fecha es un día del calendario (hora del negocio) y su regla de
 * «no futura» la aplica el service.
 */
export const registerPaymentSchema = z
  .object({
    /** Llave de ESTE intento de cobro: reenviar la misma no cobra dos veces. */
    idempotencyKey: z.uuid({ error: 'La llave del abono no es válida.' }),
    amount: amountSchema,
    paymentDate: z.iso.date('La fecha del pago no es válida (use AAAA-MM-DD).').optional(),
    notes: z
      .string({ error: 'La nota debe ser texto.' })
      .trim()
      .max(
        MAX_PAYMENT_NOTE_LENGTH,
        `La nota no puede superar ${MAX_PAYMENT_NOTE_LENGTH} caracteres.`,
      )
      .nullish()
      .transform((value) => (value === undefined || value === null || value === '' ? null : value)),
    /** Fiado al que se aplica; sin él, el abono se reparte entre los más antiguos primero. */
    saleId: z
      .uuid({ error: 'El fiado indicado no es válido.' })
      .nullish()
      .transform((value) => value ?? null),
  })
  .strict();

export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;

/** El historial se ve dentro de una ventana: 4 por página, como toda lista de ventana. */
export const DEFAULT_PAYMENTS_PAGE_SIZE = 4;
export const MAX_PAYMENTS_PAGE_SIZE = 50;

/** Tope de la página: mantiene el desplazamiento dentro de lo razonable. */
const MAX_PAGE = 100_000;

/**
 * Paginación de `GET /api/customers/:id/payments`. Con `.strict()` un parámetro
 * desconocido se rechaza en lugar de ignorarse (la pantalla mostraría algo distinto de
 * lo pedido).
 */
export const paymentsQuerySchema = z
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
      .max(MAX_PAYMENTS_PAGE_SIZE, `El tamaño de página máximo es ${MAX_PAYMENTS_PAGE_SIZE}.`)
      .default(DEFAULT_PAYMENTS_PAGE_SIZE),
  })
  .strict();

export type PaymentsQuery = z.infer<typeof paymentsQuerySchema>;
