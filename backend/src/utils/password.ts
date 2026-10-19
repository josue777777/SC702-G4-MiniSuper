import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';

/**
 * Hash de contraseñas con Argon2id (recomendación OWASP). El hash trae su sal y
 * sus parámetros, así que basta guardar la cadena completa.
 */
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

/** `true` si `plain` corresponde al hash; un hash corrupto cuenta como no válido. */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

let decoyHash: Promise<string> | undefined;

/**
 * Verifica contra un hash falso. Se usa cuando el correo no existe para que el
 * login tarde lo mismo que con un correo real y no revele cuál es el correcto.
 */
export async function verifyAgainstDecoy(plain: string): Promise<void> {
  decoyHash ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(await decoyHash, plain);
}
