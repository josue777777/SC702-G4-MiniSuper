/**
 * Texto en minúsculas y sin tildes, para que buscar «jose» encuentre «José»
 * y «CAFE» encuentre «Café molido».
 */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * `true` si alguno de los textos contiene lo buscado. Con la búsqueda vacía,
 * todo coincide.
 */
export function matchesSearch(term: string, ...texts: (string | null | undefined)[]): boolean {
  const wanted = normalizeSearch(term);

  if (wanted === '') {
    return true;
  }

  return texts.some((text) => text != null && normalizeSearch(text).includes(wanted));
}
