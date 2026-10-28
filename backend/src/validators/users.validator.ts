import { z } from 'zod';
import { ROLES } from '../auth/permissions.js';
import { emailSchema, nameSchema } from './auth.validator.js';

/** Esquemas Zod de Configuración › Usuarios (HU-12, criterios de usuarios y roles). */

const roleSchema = z.enum(ROLES, { error: 'Elija un rol válido.' });

/** Cuerpo de `POST /api/users`. La contraseña temporal la genera el servidor. */
export const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  role: roleSchema,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

/** Cuerpo de `PATCH /api/users/:id`: todo opcional, pero tiene que cambiar algo. */
export const updateUserSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    role: roleSchema.optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.email !== undefined || value.role !== undefined,
    { message: 'Indique al menos un dato para actualizar.' },
  );

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userIdParamSchema = z.object({
  id: z.uuid({ error: 'El usuario indicado no es válido.' }),
});
