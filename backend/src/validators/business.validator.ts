import { z } from 'zod';
import { IMAGE_TYPES } from '../utils/image.js';

/** Esquemas Zod de Configuración › General (datos del negocio). */

/** Texto opcional: vacío o ausente se guarda como `null`. */
function optionalText(label: string, max: number) {
  return z
    .string({ error: `${label} debe ser texto.` })
    .trim()
    .max(max, `${label} no puede superar ${max} caracteres.`)
    .nullish()
    .transform((value) => (value === undefined || value === null || value === '' ? null : value));
}

/**
 * Cuerpo de `PUT /api/business`: siempre los datos completos (lo que no se
 * envía queda vacío), igual que el formulario.
 */
export const businessSettingsSchema = z.object({
  name: z
    .string({ error: 'El nombre del negocio es obligatorio.' })
    .trim()
    .min(1, 'El nombre del negocio es obligatorio.')
    .max(80, 'El nombre no puede superar 80 caracteres.'),
  legalId: optionalText('La cédula', 30),
  phone: optionalText('El teléfono', 30).refine(
    (value) => value === null || /^[0-9+()\s-]{8,30}$/.test(value),
    'El teléfono solo puede tener números, espacios, +, - y paréntesis (mínimo 8).',
  ),
  email: optionalText('El correo', 254).refine(
    (value) => value === null || z.email().safeParse(value).success,
    'El correo no es válido.',
  ),
  address: optionalText('La dirección', 200),
  receiptMessage: optionalText('El mensaje del comprobante', 120),
});

export type BusinessSettingsInput = z.infer<typeof businessSettingsSchema>;

/** Tope del logo: se muestra pequeño (menú, login, comprobante). */
export const MAX_LOGO_BYTES = 1024 * 1024;

/** Logo: el tipo viene de `Content-Type` y los bytes del cuerpo; la firma la revisa el service. */
export const businessLogoSchema = z.object({
  mimeType: z.enum(IMAGE_TYPES, { error: 'Solo se aceptan imágenes PNG, JPG o WEBP.' }),
  data: z
    .instanceof(Uint8Array, { error: 'Adjunte la imagen del logo.' })
    .refine((data) => data.length > 0, 'Adjunte la imagen del logo.')
    .refine((data) => data.length <= MAX_LOGO_BYTES, 'El logo supera el máximo de 1 MB.'),
});

export type BusinessLogoInput = z.infer<typeof businessLogoSchema>;
