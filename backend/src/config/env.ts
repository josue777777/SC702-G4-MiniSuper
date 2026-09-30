import 'dotenv/config';
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
