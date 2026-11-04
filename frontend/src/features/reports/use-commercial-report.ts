import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { reportsService } from '../../services/reports.service';
import type { ReportFilter, ReportKind, ReportSummary } from '../../types/reports';
import { saveBlob } from '../products/use-catalog-export';
import {
  defaultDraft,
  toFilter,
  validateFilters,
  type FilterDraft,
  type FilterErrors,
} from './report-filters';

/** Qué muestra el reporte: consultando, listo (con los filtros YA aplicados) o con error. */
export type ReportView =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; report: ReportSummary; filter: ReportFilter };

export interface ExportNotice {
  kind: 'success' | 'error';
  text: string;
}

function messageOf(caught: unknown, fallback: string): string {
  return caught instanceof ApiError ? caught.message : fallback;
}

/**
 * Reportes comerciales (HU-28, HU-29, HU-30). Una consulta a la vez: si el
 * usuario cambia de reporte mientras otro carga, la respuesta tardía se ignora.
 * La exportación usa los filtros YA aplicados al reporte mostrado (`view.filter`),
 * no lo que se esté escribiendo en el formulario, para que el archivo sea
 * exactamente lo que se ve.
 */
export function useCommercialReport(kind: ReportKind) {
  const [draft, setDraft] = useState<FilterDraft>(() => defaultDraft());
  const [errors, setErrors] = useState<FilterErrors>({});
  const [view, setView] = useState<ReportView>({ status: 'loading' });
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [categoriesError, setCategoriesError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<ExportNotice | null>(null);
  const latest = useRef(0);

  const load = useCallback(async (nextKind: ReportKind, filter: ReportFilter) => {
    const id = (latest.current += 1);

    try {
      const report = await reportsService.get(nextKind, filter);

      if (id === latest.current) {
        setView({ status: 'ready', report, filter });
      }
    } catch (caught) {
      if (id === latest.current) {
        setView({ status: 'error', message: messageOf(caught, 'No se pudo generar el reporte.') });
      }
    }
  }, []);

  useEffect(() => {
    reportsService
      .options()
      .then((options) => setCategories(options.categories))
      .catch(() => setCategoriesError(true));
  }, []);

  /** Valida los filtros a la vista y, si están bien, consulta. */
  const consult = useCallback(
    (nextKind: ReportKind, nextDraft: FilterDraft) => {
      const found = validateFilters(nextKind, nextDraft);

      setErrors(found);

      if (Object.keys(found).length > 0) {
        return;
      }

      setNotice(null);
      setView({ status: 'loading' });
      void load(nextKind, toFilter(nextKind, nextDraft));
    },
    [load],
  );

  // Al cambiar de pestaña se consulta ese reporte con los filtros que ya hay escritos.
  const draftRef = useRef(draft);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    consult(kind, draftRef.current);
  }, [kind, consult]);

  const setField = useCallback(<K extends keyof FilterDraft>(key: K, value: FilterDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  /** `columns`: solo las que el usuario dejó activas; sin ella, todas. */
  const exportReport = useCallback(
    async (columns?: string[]) => {
      if (view.status !== 'ready') {
        return;
      }

      setExporting(true);
      setNotice(null);

      try {
        const { blob, fileName } = await reportsService.export(
          view.report.kind,
          view.filter,
          columns,
        );

        saveBlob(blob, fileName);
        setNotice({ kind: 'success', text: `Reporte exportado: ${fileName}` });
      } catch (caught) {
        setNotice({ kind: 'error', text: messageOf(caught, 'No se pudo exportar el reporte.') });
      } finally {
        setExporting(false);
      }
    },
    [view],
  );

  return {
    kind,
    draft,
    errors,
    view,
    categories,
    categoriesError,
    exporting,
    notice,
    setField,
    consult: () => consult(kind, draft),
    exportReport,
    dismissNotice: () => setNotice(null),
  };
}
