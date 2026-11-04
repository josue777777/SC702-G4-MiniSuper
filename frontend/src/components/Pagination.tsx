import { pageNumbers } from './page-numbers';

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
  /** Mientras se carga una página del servidor, los botones esperan. */
  busy?: boolean;
}

/**
 * «Anterior · 1 2 3 … 20 · Siguiente» y «Mostrando 21–40 de 53 clientes».
 *
 * Los números permiten saltar a una página (la última, o una del medio) sin
 * pasar por todas. Con muchas páginas se ven solo algunas: la primera, la
 * última y las vecinas de la actual (`pageNumbers`).
 *
 * Con una sola página no se dibuja nada: no hace falta ruido si todo cabe.
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
  busy = false,
}: PaginationProps) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <nav className="pagination" aria-label={label ?? `Páginas de ${itemLabel}`} aria-busy={busy}>
      <div className="pagination__controls">
        <button
          type="button"
          className="button"
          disabled={busy || page === 1}
          onClick={() => onPage(page - 1)}
        >
          Anterior
        </button>
        <ol className="pagination__pages">
          {pageNumbers(page, pageCount).map((slot, index) =>
            slot === 'gap' ? (
              <li key={`gap-${index}`} className="pagination__gap" aria-hidden="true">
                …
              </li>
            ) : (
              <li key={slot}>
                <button
                  type="button"
                  className={`pagination__page${slot === page ? ' pagination__page--current' : ''}`}
                  aria-label={`Ir a la página ${slot}`}
                  aria-current={slot === page ? 'page' : undefined}
                  disabled={busy}
                  onClick={() => {
                    if (slot !== page) onPage(slot);
                  }}
                >
                  {slot}
                </button>
              </li>
            ),
          )}
        </ol>
        <button
          type="button"
          className="button"
          disabled={busy || page === pageCount}
          onClick={() => onPage(page + 1)}
        >
          Siguiente
        </button>
      </div>
      <span className="pagination__status">
        Mostrando {from}–{to} de {total} {itemLabel} · Página {page} de {pageCount}
      </span>
    </nav>
  );
}
