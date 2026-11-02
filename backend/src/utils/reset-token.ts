import { createHash, randomBytes } from 'node:crypto';

/**
 * Enlaces de recuperación de contraseña (HU-13).
 *
 * El enlace lleva un token al azar de 256 bits; en la base solo se guarda su
 * hash SHA-256. Si alguien lee la base, no puede usar los enlaces pendientes
 * (lo mismo que con las contraseñas). SHA-256 basta aquí: el token ya es
 * aleatorio y largo, no hace falta un hash lento como el de las contraseñas.
 */

export const RESET_TOKEN_TTL_MINUTES = 30;

/** Token nuevo para el enlace (base64url: se puede poner en una URL sin escaparlo). */
export function generateResetToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Lo que se guarda y se busca en la base: nunca el token mismo. */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
