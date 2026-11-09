/**
 * Productos abiertos hace poco en Movimientos, en ESTE navegador: la lista
 * «Recientes» del buscador, para volver a ellos sin escribir. Es solo una
 * comodidad de quien usa el equipo; si el navegador no deja guardar (modo
 * privado) la lista sale vacía y la pantalla funciona igual.
 */

const STORAGE_KEY = 'minisuper.kardex-recents.v1';

/** Cuántos productos recuerda: los mismos que caben en el buscador (regla 2). */
export const MAX_RECENTS = 6;

/** Un producto reciente: lo justo para mostrarlo y abrirlo. */
export interface RecentProduct {
  id: string;
  code: string;
  name: string;
}

function isRecent(value: unknown): value is RecentProduct {
  const item = value as Partial<RecentProduct> | null;

  return (
    typeof item?.id === 'string' && typeof item.code === 'string' && typeof item.name === 'string'
  );
}

/** Los recientes, del último abierto al más viejo; vacío si no hay o están dañados. */
export function loadRecents(): RecentProduct[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const saved: unknown = raw === null ? [] : JSON.parse(raw);

    return Array.isArray(saved) ? saved.filter(isRecent).slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

/**
 * Pone el producto de primero (sin repetirlo) y guarda como mucho `MAX_RECENTS`.
 *
 * @example
 * // Recientes: [B, A] → rememberRecent(A) → [A, B]
 */
export function rememberRecent(product: RecentProduct): void {
  try {
    const next = [
      { id: product.id, code: product.code, name: product.name },
      ...loadRecents().filter((item) => item.id !== product.id),
    ].slice(0, MAX_RECENTS);

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Sin almacenamiento: solo no se recuerda.
  }
}
