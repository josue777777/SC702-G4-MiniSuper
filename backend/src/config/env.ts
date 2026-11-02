import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

/**
 * Variables de entorno del backend, validadas con Zod en el arranque.
 *
 * Si falta una variable o tiene un formato inválido, el servidor NO arranca y
 * imprime exactamente cuál está mal. Es preferible fallar aquí que recibir una
 * petición a medias en tiempo de ejecución.
 *
 * El archivo leído es `backend/.env` (cópialo de `backend/.env.example`).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  DATABASE_URL: z
    .string()
    .min(1, 'Falta DATABASE_URL. Copia backend/.env.example como backend/.env'),
  /** Clave para firmar las sesiones (HU-12/HU-14). Obligatoria en producción. */
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET debe tener al menos 32 caracteres.')
    .optional(),

  // --- Correo (recuperación de contraseña y avisos de seguridad, HU-13) -------
  /**
   * Cómo se envían los correos:
   *   - `console`: se imprimen en la consola del backend (desarrollo).
   *   - `outbox`: se guardan como archivos JSON en MAIL_OUTBOX_DIR (pruebas E2E).
   *   - `smtp`: se envían de verdad con SMTP_URL (producción).
   */
  MAIL_TRANSPORT: z.enum(['console', 'outbox', 'smtp']).default('console'),
  MAIL_OUTBOX_DIR: z.string().min(1).default('tmp/outbox'),
  /** Servidor de correo, por ejemplo `smtps://usuario:clave@smtp.proveedor.com:465`. */
  SMTP_URL: z.url({ error: 'SMTP_URL no es una dirección válida.' }).optional(),
  MAIL_FROM: z.string().min(3).default('MiniSuper <no-reply@minisuper.local>'),
  /** Dirección pública del frontend, para armar los enlaces de los correos. */
  APP_URL: z.url({ error: 'APP_URL no es una dirección válida.' }).optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Variables de entorno inválidas:');
  console.error(parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

/** Objeto tipado: en el resto del proyecto se usa `env`, nunca `process.env`. */
export const env = parsedEnv.data;

export const isProduction = env.NODE_ENV === 'production';

if (isProduction && env.SESSION_SECRET === undefined) {
  console.error('❌ Falta SESSION_SECRET: es obligatoria en producción para firmar las sesiones.');
  process.exit(1);
}

if (isProduction && (env.MAIL_TRANSPORT !== 'smtp' || env.SMTP_URL === undefined)) {
  console.error(
    '❌ En producción el correo debe enviarse de verdad: use MAIL_TRANSPORT=smtp y SMTP_URL.',
  );
  process.exit(1);
}

if (env.MAIL_TRANSPORT === 'smtp' && env.SMTP_URL === undefined) {
  console.error('❌ Con MAIL_TRANSPORT=smtp falta SMTP_URL.');
  process.exit(1);
}

/** Base de los enlaces de los correos: el frontend (por defecto, el mismo de CORS). */
export const appUrl = (env.APP_URL ?? env.CORS_ORIGIN).replace(/\/+$/, '');

/**
 * Clave de las sesiones. Sin `SESSION_SECRET` (desarrollo y pruebas) se genera
 * una al azar: no hay ningún secreto escrito en el código, y las sesiones
 * simplemente se cierran al reiniciar el servidor.
 */
export const sessionSecret = env.SESSION_SECRET ?? randomBytes(32).toString('hex');
