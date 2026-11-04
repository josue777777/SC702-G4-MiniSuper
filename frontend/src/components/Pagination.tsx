interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  /** Cómo se llaman las filas, en plural: «clientes», «productos»… */
  itemLabel: string;
  onPage: (page: number) => void;
  /** Nombre para lectores de pantalla, por ejemplo «Páginas de clientes». */
  label?: string;
}

/**
 * Controles «Anterior / Siguiente» con «Mostrando 21–40 de 53 clientes».
 *
 * Con una sola página no se dibuja nada: no hace falta ruido si todo cabe.
 * Mismo aspecto que el del historial de ventas.
 */
export function Pagination({
  page,
  pageCount,
  total,
  from,
  to,
  itemLabel,
  onPage,
  label,
}: PaginationProps) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <nav className="pagination" aria-label={label ?? `Páginas de ${itemLabel}`}>
      <button
        type="button"
        className="button"
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
      >
        Anterior
      </button>
      <span className="pagination__status">
        Mostrando {from}–{to} de {total} {itemLabel} · Página {page} de {pageCount}
      </span>
      <button
        type="button"
        className="button"
        disabled={page === pageCount}
        onClick={() => onPage(page + 1)}
      >
        Siguiente
      </button>
    </nav>
  );
}
