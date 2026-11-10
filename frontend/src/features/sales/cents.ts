/**
 * Dinero en céntimos enteros (`bigint`): la caja nunca suma con decimales
 * flotantes. Es solo para MOSTRAR el total mientras se arma el carrito; el
 * importe oficial lo calcula el servidor.
 */

const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

/**
 * ¿El texto es un importe válido? Hasta 10 dígitos enteros y 2 decimales.
 *
 * @example isMoneyText('1500.5') // true
 * @example isMoneyText('12.345') // false: tres decimales
 */
export function isMoneyText(value: string): boolean {
  return MONEY_PATTERN.test(value.trim());
}

/**
 * Convierte un importe en texto a céntimos enteros.
 *
 * @param value Importe como `"1250.5"`.
 * @returns Los céntimos como `bigint`.
 * @example toCents('1250.5') // 125050n  (1250 × 100 + 50)
 */
export function toCents(value: string): bigint {
  const [whole = '0', fraction = ''] = value.trim().split('.');

  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

/**
 * Lo contrario de `toCents`: céntimos a texto con 2 decimales.
 *
 * @example formatCents(125050n) // '1250.50'
 * @example formatCents(-99n) // '-0.99'
 */
export function formatCents(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const text = `${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;

  return negative ? `-${text}` : text;
}
