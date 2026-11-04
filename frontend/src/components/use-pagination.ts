import { useEffect, useState } from 'react';

/** Filas por página en las listas de la aplicación. */
export const DEFAULT_PAGE_SIZE = 20;

export interface PaginationState<T> {
  /** Solo las filas de la página actual: es lo que se dibuja. */
  pageItems: T[];
  page: number;
  pageCount: number;
  /** Total de filas (ya filtradas), no solo las de esta página. */
  total: number;
  /** Posición (desde 1) de la primera y la última fila visibles. */
  from: number;
  to: number;
  pageSize: number;
  setPage: (page: number) => void;
}

/**
 * Divide una lista ya cargada en páginas de `pageSize` filas.
 *
 * Así una pantalla con 500 productos dibuja 20 a la vez en lugar de una tabla
 * interminable. `resetKey` vuelve a la página 1 cuando cambia lo que se busca
 * o se filtra (si no, una búsqueda nueva podría quedar en una página vacía).
 *
 * Paginar en el navegador alcanza para listas que no crecen sin límite
 * (clientes, proveedores, productos). Lo que crece con el tiempo (ventas,
 * movimientos, el detalle de los reportes) se pagina en el servidor y usa el
 * mismo componente `Pagination` (ver `usePagedRows` y docs/PANTALLAS.md).
 */
export function usePagination<T>(
  items: readonly T[],
  resetKey: unknown = null,
  pageSize: number = DEFAULT_PAGE_SIZE,
): PaginationState<T> {
  const [page, setPage] = useState(1);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // Si la lista se achicó (por ejemplo, al desactivar), no quedarse más allá del final.
  const current = Math.min(page, pageCount);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const start = (current - 1) * pageSize;

  return {
    pageItems: items.slice(start, start + pageSize),
    page: current,
    pageCount,
    total,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
    pageSize,
    setPage: (next) => setPage(Math.min(Math.max(1, next), pageCount)),
  };
}
