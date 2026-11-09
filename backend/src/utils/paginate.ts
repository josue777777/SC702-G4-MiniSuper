/** Una página de una lista, con lo necesario para dibujar la paginación. */
export interface PageOf<T> {
  rows: T[];
  /** Página devuelta (desde 1); si se pidió una que ya no existe, la última. */
  page: number;
  pageSize: number;
  /** Filas de la lista completa, no solo de esta página. */
  total: number;
  pageCount: number;
}

/**
 * Corta una lista en la página pedida. Si la página ya no existe (por ejemplo,
 * porque se anuló una venta entre una consulta y otra), devuelve la última:
 * mejor ver filas que una tabla vacía sin explicación.
 *
 * La usan los reportes (`/rows`): el servidor arma el reporte y manda solo la
 * página que se va a mostrar.
 */
export function pageOf<T>(rows: readonly T[], page: number, pageSize: number): PageOf<T> {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;

  return { rows: rows.slice(start, start + pageSize), page: current, pageSize, total, pageCount };
}

/** Todas las filas como una sola página (para el PDF, que es el documento completo). */
export function allOf<T>(rows: readonly T[]): PageOf<T> {
  return pageOf(rows, 1, Math.max(1, rows.length));
}
