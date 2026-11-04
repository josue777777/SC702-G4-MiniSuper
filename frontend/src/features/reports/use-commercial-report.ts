import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { reportsService } from '../../services/reports.service';
import type { ReportFilter, ReportKind, ReportResult } from '../../types/reports';
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
  | { status: 'ready'; report: ReportResult; filter: ReportFilter };

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
export function useCommercialReport() {
  const [kind, setKind] = useState<ReportKind>('sales');
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
    void load('sales', toFilter('sales', defaultDraft()));
    reportsService
      .options()
      .then((options) => setCategories(options.categories))
      .catch(() => setCategoriesError(true));
  }, [load]);

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

  const selectKind = useCallback(
    (next: ReportKind) => {
      setKind(next);
      consult(next, draft);
    },
    [consult, draft],
  );

  const setField = useCallback(<K extends keyof FilterDraft>(key: K, value: FilterDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  const exportReport = useCallback(async () => {
    if (view.status !== 'ready') {
      return;
    }

    setExporting(true);
    setNotice(null);

    try {
      const { blob, fileName } = await reportsService.export(view.report.kind, view.filter);

      saveBlob(blob, fileName);
      setNotice({ kind: 'success', text: `Reporte exportado: ${fileName}` });
    } catch (caught) {
      setNotice({ kind: 'error', text: messageOf(caught, 'No se pudo exportar el reporte.') });
    } finally {
      setExporting(false);
    }
  }, [view]);

  return {
    kind,
    draft,
    errors,
    view,
    categories,
    categoriesError,
    exporting,
    notice,
    selectKind,
    setField,
    consult: () => consult(kind, draft),
    exportReport,
    dismissNotice: () => setNotice(null),
  };
}
