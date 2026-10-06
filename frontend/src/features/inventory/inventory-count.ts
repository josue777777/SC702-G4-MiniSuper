/**
 * Funciones puras de la pantalla de conteo físico (HU-10), sin React.
 *
 * La validación es de experiencia de usuario: la fuente de verdad sigue siendo
 * el validador del backend, que usa el mismo mensaje para la cantidad negativa.
 */

/** Mismo mensaje que el backend: HU-10 pide rechazar el negativo y pedir corregirlo. */
export const NEGATIVE_COUNT_MESSAGE =
  'La cantidad contada no puede ser negativa. Corríjala e intente de nuevo.';

/**
 * Convierte lo escrito en el campo a una cantidad válida, o devuelve el error.
 */
export function parseCountedQuantity(
  value: string,
): { ok: true; quantity: number } | { ok: false; error: string } {
  const trimmed = value.trim();

  if (trimmed === '') {
    return { ok: false, error: 'Escriba la cantidad contada.' };
  }

  if (!/^-?\d+$/.test(trimmed)) {
    return { ok: false, error: 'La cantidad contada debe ser un número entero.' };
  }

  const quantity = Number(trimmed);

  if (quantity < 0) {
    return { ok: false, error: NEGATIVE_COUNT_MESSAGE };
  }

  return { ok: true, quantity };
}

/** Diferencia con signo explícito y su lectura en palabras del dueño. */
export function describeDifference(difference: number): { value: string; text: string } {
  if (difference === 0) {
    return { value: '0', text: 'coincide con el sistema' };
  }

  if (difference < 0) {
    return { value: String(difference), text: `faltan ${Math.abs(difference)}` };
  }

  return { value: `+${difference}`, text: `sobran ${difference}` };
}

/** Fecha y hora en la zona horaria de quien mira la pantalla. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });
}
