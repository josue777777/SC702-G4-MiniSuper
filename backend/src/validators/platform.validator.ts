import { z } from 'zod';
import { emailSchema, nameSchema } from './auth.validator.js';

/** Esquemas Zod de la plataforma (solo Administrador) y de las solicitudes. */

const extraUsersSchema = z
  .number({ error: 'Indique cuántos usuarios adicionales.' })
  .int('Debe ser un número entero.')
  .min(0, 'No puede ser negativo.')
  .max(500, 'No puede superar 500 usuarios adicionales.');

/** Cuerpo de `PUT /api/platform/settings`. */
export const platformSettingsSchema = z.object({
  systemName: z
    .string({ error: 'Escriba el nombre del sistema.' })
    .trim()
    .min(1, 'Escriba el nombre del sistema.')
    .max(40, 'El nombre no puede superar 40 caracteres.'),
  pricePerExtraUser: z
    .string({ error: 'Escriba el precio por usuario.' })
    .trim()
    .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Escriba un monto válido, por ejemplo 5000 o 5000.50.')
    .transform((value) => Number(value).toFixed(2)),
});

/**
 * Cuerpo de `POST /api/platform/businesses`: el negocio nuevo, su plan y su
 * Encargado. La contraseña temporal del Encargado la genera el servidor.
 */
export const createBusinessSchema = z.object({
  businessName: z
    .string({ error: 'Escriba el nombre del negocio.' })
    .trim()
    .min(1, 'Escriba el nombre del negocio.')
    .max(80, 'El nombre no puede superar 80 caracteres.'),
  extraUsers: extraUsersSchema,
  managerName: nameSchema,
  managerEmail: emailSchema,
});

/** Cuerpo de `PATCH /api/platform/businesses/:id/plan`. */
export const businessPlanSchema = z.object({ extraUsers: extraUsersSchema });

/** Cuerpo de `POST /api/plan-requests` (el Encargado pide más usuarios). */
export const planRequestSchema = z.object({
  extraUsers: z
    .number({ error: 'Indique cuántos usuarios más necesita.' })
    .int('Debe ser un número entero.')
    .min(1, 'Pida al menos 1 usuario.')
    .max(50, 'Puede pedir hasta 50 usuarios por solicitud.'),
  note: z
    .string()
    .trim()
    .max(300, 'La nota no puede superar 300 caracteres.')
    .nullish()
    .transform((value) => (value === undefined || value === null || value === '' ? null : value)),
});

/** Cuerpo de aprobar o rechazar una solicitud. */
export const decideRequestSchema = z.object({
  response: z
    .string()
    .trim()
    .max(300, 'La respuesta no puede superar 300 caracteres.')
    .nullish()
    .transform((value) => (value === undefined || value === null || value === '' ? null : value)),
});

export const requestStatusQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
});

export const idParamSchema = z.object({ id: z.uuid({ error: 'El identificador no es válido.' }) });

export type PlatformSettingsInput = z.infer<typeof platformSettingsSchema>;
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type PlanRequestInput = z.infer<typeof planRequestSchema>;
