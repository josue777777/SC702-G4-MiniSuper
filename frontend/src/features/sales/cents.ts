/**
 * Dinero en céntimos enteros (`bigint`): la caja nunca suma con decimales
 * flotantes. Es solo para MOSTRAR el total mientras se arma el carrito; el
 * importe oficial lo calcula el servidor.
 */

const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

export function isMoneyText(value: string): boolean {
  return MONEY_PATTERN.test(value.trim());
}

export function toCents(value: string): bigint {
  const [whole = '0', fraction = ''] = value.trim().split('.');

  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function formatCents(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const text = `${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;

  return negative ? `-${text}` : text;
}
