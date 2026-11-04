import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_PAGE_SIZE } from '../../components/use-pagination';
import { ApiError } from '../../services/api-client';
import type { PageOf } from '../../types/reports';

export type PagedRowsView<T> =
  | { status: 'idle' }
  /** `previous`: la página que se estaba viendo; queda a la vista mientras llega la nueva. */
  | { status: 'loading'; previous: PageOf<T> | null }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: PageOf<T> };

/**
 * Filas pedidas al servidor de a una página (el «Ver detalle» de los reportes).
 *
 * No se pide nada hasta que `enabled` es verdadero (el usuario abrió el
 * detalle): quien solo mira el total y los gráficos no descarga filas. Cada
 * página trae 20, así que con un año de ventas la pantalla sigue liviana.
 *
 * `fetchPage` dice cómo pedir una página (reporte, filtros y sección). Quien lo
 * usa se monta con `key` = el reporte generado: al regenerarlo, todo empieza de
 * cero. Una respuesta que llega tarde (de una página anterior) se descarta.
 */
export function usePagedRows<T>(
  fetchPage: (page: number, pageSize: number) => Promise<PageOf<T>>,
  enabled: boolean,
  pageSize: number = DEFAULT_PAGE_SIZE,
) {
  const [page, setPage] = useState(1);
  const [view, setView] = useState<PagedRowsView<T>>({ status: 'idle' });
  const latest = useRef(0);
  /** Página que ya está en pantalla: no se vuelve a pedir. */
  const shown = useRef<number | null>(null);
  // La función puede cambiar en cada render; se usa siempre la última.
  const fetchRef = useRef(fetchPage);

  fetchRef.current = fetchPage;

  const load = useCallback(
    async (wanted: number) => {
      const id = (latest.current += 1);

      setView((current) => ({
        status: 'loading',
        previous: current.status === 'ready' ? current.data : null,
      }));

      try {
        const data = await fetchRef.current(wanted, pageSize);

        if (id === latest.current) {
          shown.current = data.page;
          setView({ status: 'ready', data });
          // Si la página pedida ya no existe, el servidor devuelve la última: seguirla.
          setPage(data.page);
        }
      } catch (caught) {
        if (id === latest.current) {
          setView({
            status: 'error',
            message:
              caught instanceof ApiError ? caught.message : 'No se pudieron cargar las filas.',
          });
        }
      }
    },
    [pageSize],
  );

  useEffect(() => {
    if (enabled && shown.current !== page) {
      void load(page);
    }
  }, [enabled, page, load]);

  const data =
    view.status === 'ready' ? view.data : view.status === 'loading' ? view.previous : null;
  const from = data === null || data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;

  return {
    page,
    view,
    /** La página a la vista (la nueva, o la anterior mientras llega la nueva). */
    data,
    loading: view.status === 'loading',
    /** Lo que necesita `Pagination`. */
    pagination:
      data === null
        ? null
        : {
            page,
            pageCount: data.pageCount,
            total: data.total,
            from,
            to: from === 0 ? 0 : from + data.rows.length - 1,
          },
    setPage,
    retry: () => void load(page),
  };
}
