/** Un botón de número de página o un «…» que resume las que se saltan. */
export type PageSlot = number | 'gap';

/**
 * Qué números de página mostrar: siempre la primera y la última, la actual y
 * sus vecinas, y «…» donde se saltan páginas. Así, con 500 páginas se ven
 * unos 7 botones y no 500:
 *
 *   página 1 de 20   →  1 2 3 … 20
 *   página 8 de 20   →  1 … 7 8 9 … 20
 *   página 20 de 20  →  1 … 18 19 20
 *
 * Un «…» que solo ocultaría una página muestra esa página: «1 … 3» no ahorra
 * nada frente a «1 2 3».
 */
export function pageNumbers(page: number, pageCount: number, neighbours = 1): PageSlot[] {
  const wanted = new Set<number>([1, pageCount]);

  for (let offset = -neighbours; offset <= neighbours; offset += 1) {
    wanted.add(page + offset);
  }

  // Al principio y al final se muestran un par más, para que la fila no "salte".
  if (page <= neighbours + 2) {
    for (let next = 1; next <= neighbours * 2 + 2; next += 1) wanted.add(next);
  }

  if (page >= pageCount - neighbours - 1) {
    for (let next = pageCount - neighbours * 2 - 1; next <= pageCount; next += 1) wanted.add(next);
  }

  const pages = [...wanted]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b);
  const slots: PageSlot[] = [];

  for (const value of pages) {
    const previous = slots.at(-1);

    if (typeof previous === 'number' && value - previous === 2) {
      slots.push(previous + 1);
    } else if (typeof previous === 'number' && value - previous > 2) {
      slots.push('gap');
    }

    slots.push(value);
  }

  return slots;
}
