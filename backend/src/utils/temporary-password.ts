import { randomInt } from 'node:crypto';

/** Sin letras ni números que se confunden al dictarlos o copiarlos (0/O, 1/l/I). */
const LETTERS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const ALPHABET = LETTERS + DIGITS;

export const TEMPORARY_PASSWORD_LENGTH = 12;

function pick(chars: string): string {
  return chars.charAt(randomInt(chars.length));
}

/**
 * Contraseña temporal al azar (generador criptográfico). Cumple la política de
 * contraseñas: 12 caracteres con al menos una letra y un número. El usuario
 * debe cambiarla al ingresar.
 */
export function generateTemporaryPassword(): string {
  const chars = [pick(LETTERS), pick(DIGITS)];

  while (chars.length < TEMPORARY_PASSWORD_LENGTH) {
    chars.push(pick(ALPHABET));
  }

  // Mezcla (Fisher-Yates) para que la letra y el número no queden siempre al inicio.
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [chars[index], chars[other]] = [chars[other] as string, chars[index] as string];
  }

  return chars.join('');
}
