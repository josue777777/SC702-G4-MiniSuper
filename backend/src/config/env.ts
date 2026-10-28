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

/**
 * Clave de las sesiones. Sin `SESSION_SECRET` (desarrollo y pruebas) se genera
 * una al azar: no hay ningún secreto escrito en el código, y las sesiones
 * simplemente se cierran al reiniciar el servidor.
 */
export const sessionSecret = env.SESSION_SECRET ?? randomBytes(32).toString('hex');
