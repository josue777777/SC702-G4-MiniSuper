/**
 * Aritmética de dinero exacta, en céntimos (enteros `bigint`).
 *
 * Los importes viajan como cadena con dos decimales (`"1500.00"`, igual que en
 * el resto de la API) y se calculan aquí sin `number`: sumar 0.1 + 0.2 con
 * floats no da 0.3, y un total de venta no puede tener ese error. La base usa
 * `Decimal(12, 2)`, que coincide exactamente con esta representación.
 */

const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

/** `true` si la cadena es un importe válido: sin signo, hasta 2 decimales. */
export function isMoney(value: string): boolean {
  return MONEY_PATTERN.test(value);
}

/** `"1234.5"` → `123450n`. Lanza si el formato no es un importe válido. */
export function toCents(value: string): bigint {
  if (!isMoney(value)) {
    throw new Error(`Importe inválido: ${value}`);
  }

  const [whole = '0', fraction = ''] = value.split('.');

  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

/** `123450n` → `"1234.50"`. */
export function formatCents(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const text = `${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;

  return negative ? `-${text}` : text;
}
