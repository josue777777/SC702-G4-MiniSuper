/**
 * Paginación de Movimientos, siempre visible y en el mismo lugar (también sin
 * datos o mientras llegan), para que la pantalla no salte: «N movimientos ·
 * Página X de Y» y los botones Anterior / Siguiente.
 */
export function MovementsPager({
  label,
  page,
  totalPages,
  total,
  onPage,
}: {
  label: string;
  /** `null` mientras no hay datos: se ve «—» y los botones apagados. */
  page: number | null;
  totalPages: number;
  total: number | null;
  onPage: (next: number) => void;
}) {
  const pages = Math.max(1, totalPages);

  return (
    <nav className="kardex-pager" aria-label={label}>
      <span className="muted">
        {total === null
          ? '—'
          : `${total.toLocaleString('es-CR')} ${total === 1 ? 'movimiento' : 'movimientos'}`}{' '}
        · Página {page ?? '—'} de {page === null ? '—' : pages}
      </span>
      <button
        type="button"
        className="button"
        disabled={page === null || page <= 1}
        onClick={() => onPage((page ?? 1) - 1)}
      >
        Anterior
      </button>
      <button
        type="button"
        className="button"
        disabled={page === null || page >= pages}
        onClick={() => onPage((page ?? 1) + 1)}
      >
        Siguiente
      </button>
    </nav>
  );
}
