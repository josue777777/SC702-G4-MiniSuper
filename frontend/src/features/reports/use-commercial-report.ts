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

/** Cuánto se espera a que el usuario termine de escribir antes de consultar. */
export const AUTO_APPLY_DELAY_MS = 400;

/**
 * Qué muestra el reporte. Mientras se consulta con filtros nuevos, el resultado
 * anterior (`previous`) sigue a la vista, atenuado: la pantalla no parpadea.
 */
export type ReportView =
  { status: 'loading'; previous: Ready | null } | { status: 'error'; message: string } | Ready;

interface Ready {
  status: 'ready';
  report: ReportSummary;
  /** Filtros con que se generó (los que usan el detalle, el PDF y el Excel). */
  filter: ReportFilter;
}

/**
 * Estado para las pruebas y los lectores de pantalla: `pending` si hay filtros
 * sin aplicar o una consulta en curso; `done` si lo mostrado corresponde a los
 * filtros escritos; `invalid` si hay errores (no se consulta).
 */
export type ReportSync = 'pending' | 'done' | 'invalid';

export interface ExportNotice {
  kind: 'success' | 'error';
  text: string;
}

function messageOf(caught: unknown, fallback: string): string {
  return caught instanceof ApiError ? caught.message : fallback;
}

/**
 * Reportes comerciales (HU-28, HU-29, HU-30). Los filtros se aplican SOLOS:
 * al cambiar uno se espera un instante (`AUTO_APPLY_DELAY_MS`, por si sigue
 * escribiendo) y se consulta. Con errores, se muestran y no se consulta.
 *
 * Una consulta a la vez: si llega tarde la respuesta de filtros viejos, se
 * descarta. La exportación usa los filtros YA aplicados al reporte mostrado
 * (`view.filter`), para que el archivo sea exactamente lo que se ve.
 */
export function useCommercialReport(kind: ReportKind) {
  const [draft, setDraft] = useState<FilterDraft>(() => defaultDraft());
  const [errors, setErrors] = useState<FilterErrors>({});
  const [view, setView] = useState<ReportView>({ status: 'loading', previous: null });
  const [requestedKey, setRequestedKey] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [categoriesError, setCategoriesError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<ExportNotice | null>(null);
  const [refreshes, setRefreshes] = useState(0);
  const latest = useRef(0);
  const shownKind = useRef<ReportKind | null>(null);
  const shownRefresh = useRef(0);

  useEffect(() => {
    reportsService
      .options()
      .then((options) => setCategories(options.categories))
      .catch(() => setCategoriesError(true));
  }, []);

  const found = validateFilters(kind, draft);
  const valid = Object.keys(found).length === 0;
  const filter = valid ? toFilter(kind, draft) : null;
  const filterKey = filter === null ? null : `${kind}|${JSON.stringify(filter)}|${refreshes}`;
  // El filtro de ESTE render, para el temporizador (su contenido lo resume `filterKey`).
  const filterRef = useRef(filter);

  filterRef.current = filter;

  const load = useCallback(async (nextKind: ReportKind, nextFilter: ReportFilter, key: string) => {
    const id = (latest.current += 1);

    shownKind.current = nextKind;
    setRequestedKey(key);
    setNotice(null);
    setView((current) => ({
      status: 'loading',
      // Al cambiar de pestaña no se muestra el reporte de otra: solo el del mismo tipo.
      previous:
        current.status === 'ready' && current.report.kind === nextKind
          ? current
          : current.status === 'loading'
            ? current.previous
            : null,
    }));

    try {
      const report = await reportsService.get(nextKind, nextFilter);

      if (id === latest.current) {
        setView({ status: 'ready', report, filter: nextFilter });
      }
    } catch (caught) {
      if (id === latest.current) {
        setView({ status: 'error', message: messageOf(caught, 'No se pudo generar el reporte.') });
      }
    }
  }, []);

  // Los errores se muestran a medida que se escribe.
  const foundKey = JSON.stringify(found);

  useEffect(() => {
    setErrors(JSON.parse(foundKey) as FilterErrors);
  }, [foundKey]);

  // Aplicar solo: inmediato al abrir o cambiar de reporte; con una espera corta al filtrar.
  useEffect(() => {
    const current = filterRef.current;

    if (current === null || filterKey === null) {
      return;
    }

    // Sin esperar: al abrir, al cambiar de pestaña o al pulsar «Actualizar».
    const immediate = shownKind.current !== kind || shownRefresh.current !== refreshes;

    shownRefresh.current = refreshes;

    const timer = window.setTimeout(
      () => void load(kind, current, filterKey),
      immediate ? 0 : AUTO_APPLY_DELAY_MS,
    );

    return () => window.clearTimeout(timer);
    // `filterKey` resume el reporte y sus filtros: solo se consulta si cambian de verdad.
  }, [kind, filterKey, refreshes, load]);

  const setField = useCallback(<K extends keyof FilterDraft>(key: K, value: FilterDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  /** Cambia varios filtros a la vez (un período rápido cambia desde y hasta). */
  const setFields = useCallback((changes: Partial<FilterDraft>) => {
    setDraft((current) => ({ ...current, ...changes }));
  }, []);

  /** Vuelve a consultar con los mismos filtros (el de deudas es una foto del momento). */
  const refresh = useCallback(() => setRefreshes((count) => count + 1), []);

  const sync: ReportSync = !valid
    ? 'invalid'
    : view.status === 'loading' || requestedKey !== filterKey
      ? 'pending'
      : 'done';

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
    sync,
    categories,
    categoriesError,
    exporting,
    notice,
    setField,
    setFields,
    reset: () => setDraft((current) => ({ ...defaultDraft(), from: current.from, to: current.to })),
    refresh,
    exportReport,
    dismissNotice: () => setNotice(null),
  };
}
