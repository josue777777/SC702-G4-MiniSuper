import { z } from 'zod';
import { USERNAME_PATTERN } from '../utils/username.js';

/** Esquemas Zod del acceso: administrador inicial, login y perfil (HU-11 a HU-14). */

export const PASSWORD_MIN_LENGTH = 10;
/** Tope para que una contraseña enorme no sea una forma barata de agotar el CPU al hashear. */
export const PASSWORD_MAX_LENGTH = 128;

export const nameSchema = z
  .string({ error: 'El nombre es obligatorio.' })
  .trim()
  .min(1, 'El nombre no puede estar vacío.')
  .max(80, 'El nombre no puede superar 80 caracteres.');

/** El correo se guarda en minúsculas: así el login no depende de cómo lo escribió el usuario. */
export const emailSchema = z
  .string({ error: 'El correo es obligatorio.' })
  .trim()
  .toLowerCase()
  .max(254, 'El correo no puede superar 254 caracteres.')
  .pipe(z.email({ error: 'El correo no es válido.' }));

/**
 * Nombre de usuario (HU-11, HU-12): en minúscula, de 2 a 30 caracteres,
 * empieza con letra y solo lleva letras, números, punto, guion o guion bajo.
 * Nunca `@`, para no confundirse con un correo en el login.
 */
export const usernameSchema = z
  .string({ error: 'El usuario es obligatorio.' })
  .trim()
  .toLowerCase()
  .regex(
    USERNAME_PATTERN,
    'El usuario debe tener de 2 a 30 caracteres, empezar con una letra y usar solo letras, números, punto, guion o guion bajo (sin tildes ni espacios).',
  );

/** Política de contraseña nueva (HU-12): longitud mínima, al menos una letra y un número. */
export const newPasswordSchema = z
  .string({ error: 'La contraseña es obligatoria.' })
  .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .max(PASSWORD_MAX_LENGTH, `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres.`)
  .refine((value) => /\p{L}/u.test(value), 'La contraseña debe incluir al menos una letra.')
  .refine((value) => /\d/.test(value), 'La contraseña debe incluir al menos un número.');

/**
 * Datos del administrador inicial (HU-12), leídos del `.env` por el comando
 * `npm run db:seed`. Misma política de contraseña que cualquier otra.
 */
export const initialAdminSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: newPasswordSchema,
  })
  .superRefine((value, ctx) => {
    if (value.password.toLowerCase() === value.email) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'La contraseña no puede ser igual al correo.',
      });
    }
  });

export type InitialAdminInput = z.infer<typeof initialAdminSchema>;

/**
 * Cuerpo de `POST /api/auth/login` (HU-11). Se valida el FORMATO (correo válido y
 * longitud de la contraseña), pero no la política completa: el login solo compara.
 * Toda cuenta se creó con al menos `PASSWORD_MIN_LENGTH` caracteres; si algún día
 * sube ese mínimo, aquí debe quedarse el anterior para no dejar fuera a nadie.
 */
export const loginSchema = z.object({
  /** Correo o nombre de usuario (HU-11): con `@` es correo; sin `@`, usuario. */
  login: z
    .string({ error: 'Escriba su correo o su usuario.' })
    .trim()
    .toLowerCase()
    .min(1, 'Escriba su correo o su usuario.')
    .max(254, 'El correo o usuario no puede superar 254 caracteres.'),
  password: z
    .string({ error: 'La contraseña es obligatoria.' })
    .min(1, { error: 'La contraseña es obligatoria.', abort: true })
    .min(
      PASSWORD_MIN_LENGTH,
      `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    )
    .max(PASSWORD_MAX_LENGTH, `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres.`),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Cuerpo de `PATCH /api/profile`: todo es opcional, pero tiene que cambiar algo. */
export const updateProfileSchema = z
  .object({
    name: nameSchema.optional(),
    /** `null` quita el correo (solo el personal; lo comprueba el service). */
    email: emailSchema.nullable().optional(),
    /** Obligatoria al cambiar el correo o la contraseña (lo comprueba el service). */
    currentPassword: z.string().max(PASSWORD_MAX_LENGTH).optional(),
    newPassword: newPasswordSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.name === undefined && value.email === undefined && value.newPassword === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Indique al menos un dato para actualizar.' });
    }
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Cuerpo de `POST /api/auth/password/forgot` (HU-13). */
export const forgotPasswordSchema = z.object({ email: emailSchema });

/**
 * Cuerpo de `POST /api/auth/password/reset` (HU-13): el token del enlace y la
 * contraseña nueva, con la misma política que cualquier otra.
 */
export const resetPasswordSchema = z.object({
  token: z
    .string({ error: 'Falta el enlace de recuperación.' })
    .trim()
    .min(20, 'El enlace no es válido.')
    .max(200, 'El enlace no es válido.'),
  password: newPasswordSchema,
});
