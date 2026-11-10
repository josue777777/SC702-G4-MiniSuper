import { z } from 'zod';

/** Esquemas Zod del cliente básico que HU-18 necesita para fiar. */

export const createCustomerSchema = z.object({
  name: z
    .string({ error: 'El nombre es obligatorio.' })
    .trim()
    .min(1, 'El nombre no puede estar vacío.')
    .max(120, 'El nombre no puede superar 120 caracteres.'),
  phone: z
    .string({ error: 'El teléfono debe ser texto.' })
    .trim()
    .max(30, 'El teléfono no puede superar 30 caracteres.')
    .nullish()
    .transform((value) => (value === undefined || value === null || value === '' ? null : value)),
});

/** Paginación de `GET /api/customers/:id/purchases` (HU-36). */
export const customerPurchaseHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(15),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
