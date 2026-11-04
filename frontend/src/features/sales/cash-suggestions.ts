import { formatCents, toCents } from './cents';

/** Billetes de colones con los que suele pagar un cliente, en céntimos. */
const BILLS = [1_000n, 2_000n, 5_000n, 10_000n, 20_000n].map((colones) => colones * 100n);

/**
 * Montos rápidos para el efectivo: el monto exacto y los billetes redondos más
 * cercanos que alcanzan para pagar. Con un total de ₡3 900 sugiere ₡3 900,
 * ₡4 000, ₡5 000 y ₡10 000: un toque en lugar de escribir el monto.
 */
export function cashSuggestions(total: string, max = 4): string[] {
  const totalCents = toCents(total);

  if (totalCents <= 0n) {
    return [];
  }

  const amounts = new Set<bigint>([totalCents]);

  for (const bill of BILLS) {
    const rounded = ((totalCents + bill - 1n) / bill) * bill;

    if (rounded > totalCents) {
      amounts.add(rounded);
    }
  }

  return [...amounts]
    .sort((a, b) => (a < b ? -1 : 1))
    .slice(0, max)
    .map(formatCents);
}
