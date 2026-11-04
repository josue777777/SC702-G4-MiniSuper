import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_PAGE_SIZE } from '../../components/use-pagination';
import { ApiError } from '../../services/api-client';
import { reportsService } from '../../services/reports.service';
import type { ReportFilter, ReportKind, ReportRowsPage } from '../../types/reports';

export type RowsView =
  | { status: 'idle' }
  /** `previous`: la página que se estaba viendo; queda a la vista mientras llega la nueva. */
  | { status: 'loading'; previous: ReportRowsPage | null }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: ReportRowsPage };

/**
 * Las filas de «Ver detalle», pedidas al servidor de a una página.
 *
 * No se pide nada hasta que el usuario abre el detalle (`enabled`): quien solo
 * mira el total y los gráficos no descarga filas. Cada página trae 20, así que
 * con un año de ventas (decenas de miles de líneas) la pantalla sigue liviana.
 *
 * Quien lo usa se monta con `key` = el reporte generado: al regenerarlo, todo
 * empieza de cero (página 1, sin filas viejas). Una respuesta que llega tarde
 * (de una página anterior) se descarta.
 */
export function useReportRows(
  kind: ReportKind,
  filter: ReportFilter,
  enabled: boolean,
  pageSize: number = DEFAULT_PAGE_SIZE,
) {
  const [page, setPage] = useState(1);
  const [view, setView] = useState<RowsView>({ status: 'idle' });
  const latest = useRef(0);
  /** Página que ya está en pantalla: no se vuelve a pedir. */
  const shown = useRef<number | null>(null);

  const load = useCallback(
    async (wanted: number) => {
      const id = (latest.current += 1);

      setView((current) => ({
        status: 'loading',
        previous: current.status === 'ready' ? current.data : null,
      }));

      try {
        const data = await reportsService.rows(kind, filter, wanted, pageSize);

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
    [kind, filter, pageSize],
  );

  useEffect(() => {
    if (enabled && shown.current !== page) {
      void load(page);
    }
  }, [enabled, page, load]);

  return { page, view, setPage, retry: () => void load(page) };
}
