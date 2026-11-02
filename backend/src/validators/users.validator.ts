import { z } from 'zod';
import { ROLES } from '../auth/permissions.js';
import { emailSchema, nameSchema, usernameSchema } from './auth.validator.js';

/** Esquemas Zod de Configuración › Usuarios (HU-12, criterios de usuarios y roles). */

const roleSchema = z.enum(ROLES, { error: 'Elija un rol válido.' });

/**
 * Cuerpo de `POST /api/users`. La contraseña temporal la genera el servidor.
 * `businessId` solo lo usa el Administrador al crear un Encargado; el
 * Encargado crea siempre en su propio negocio (el de su sesión).
 *
 * `username` es opcional: si no viene, el servidor genera uno libre a partir
 * del nombre. `email` es obligatorio solo para los roles que recuperan su
 * contraseña por correo (lo comprueba el service con `ROLE_RECOVERY`).
 */
export const createUserSchema = z.object({
  name: nameSchema,
  username: usernameSchema.optional(),
  email: emailSchema.nullable().optional(),
  role: roleSchema,
  businessId: z.uuid({ error: 'El negocio indicado no es válido.' }).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

/** Cuerpo de `PATCH /api/users/:id`: todo opcional, pero tiene que cambiar algo. */
export const updateUserSchema = z
  .object({
    name: nameSchema.optional(),
    username: usernameSchema.optional(),
    /** `null` quita el correo (solo si el rol no recupera por correo). */
    email: emailSchema.nullable().optional(),
    role: roleSchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.username !== undefined ||
      value.email !== undefined ||
      value.role !== undefined,
    { message: 'Indique al menos un dato para actualizar.' },
  );

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userIdParamSchema = z.object({
  id: z.uuid({ error: 'El usuario indicado no es válido.' }),
});

/** `GET /api/users/username-suggestion?name=…`: el usuario libre que se sugiere. */
export const usernameSuggestionSchema = z.object({ name: nameSchema });
