import { useEffect, useState } from 'react';
import type { ReportKind } from '../../types/reports';
import { ReportCustomizeModal } from './ReportCustomizeModal';
import { ReportFilters } from './ReportFilters';
import { ReportPdfPreview } from './ReportPdfPreview';
import { ReportResultView } from './ReportResultView';
import {
  loadReportPreferences,
  saveReportPreferences,
  visibleReportColumns,
  type ReportPreferences,
} from './report-preferences';
import { useCommercialReport } from './use-commercial-report';

interface CommercialReportPanelProps {
  kind: ReportKind;
}

/**
 * Un reporte comercial (HU-28 ventas, HU-29 ganancias, HU-30 productos más
 * vendidos y deudas): filtros, resultado y sus acciones (HU-40). Solo se monta
 * con el permiso `reports.sales`; la API lo exige además en cada consulta.
 *
 * Lo que el usuario personaliza (columnas y hoja) vale para la tabla, el PDF y
 * el Excel, y se recuerda por reporte.
 */
export function CommercialReportPanel({ kind }: CommercialReportPanelProps) {
  const report = useCommercialReport(kind);
  const { view } = report;
  const [preferences, setPreferences] = useState<ReportPreferences>(() =>
    loadReportPreferences(kind),
  );
  const [customizing, setCustomizing] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  // Cada reporte recuerda su propia personalización.
  useEffect(() => {
    setPreferences(loadReportPreferences(kind));
  }, [kind]);

  const ready = view.status === 'ready' ? view.report : null;
  const columns = ready === null ? [] : visibleReportColumns(ready.columns, preferences);
  // Si no se ocultó nada, el Excel va completo (sin parámetro).
  const exportColumns =
    ready !== null && columns.length < ready.columns.length
      ? columns.map((column) => column.key)
      : undefined;

  return (
    <>
      <ReportFilters
        kind={kind}
        draft={report.draft}
        errors={report.errors}
        categories={report.categories}
        categoriesError={report.categoriesError}
        busy={view.status === 'loading'}
        onChange={report.setField}
        onSubmit={report.consult}
      />

      {view.status === 'loading' ? (
        <p className="muted" role="status">
          Cargando reporte…
        </p>
      ) : null}

      {view.status === 'error' ? (
        <div className="alert alert--error" role="alert">
          {view.message}
        </div>
      ) : null}

      {ready === null ? null : (
        <ReportResultView
          report={ready}
          filter={view.status === 'ready' ? view.filter : {}}
          columns={columns}
          exporting={report.exporting}
          notice={report.notice}
          onExport={() => void report.exportReport(exportColumns)}
          onPdf={() => setPreviewing(true)}
          onCustomize={() => setCustomizing(true)}
          onDismissNotice={report.dismissNotice}
        />
      )}

      {customizing && ready !== null ? (
        <ReportCustomizeModal
          columns={ready.columns}
          preferences={preferences}
          onApply={(next) => {
            setPreferences(next);
            saveReportPreferences(kind, next);
            setCustomizing(false);
          }}
          onClose={() => setCustomizing(false)}
        />
      ) : null}

      {previewing && ready !== null ? (
        <ReportPdfPreview
          report={ready}
          filter={view.status === 'ready' ? view.filter : {}}
          columns={columns}
          orientation={preferences.orientation}
          onClose={() => setPreviewing(false)}
          onExcel={() => void report.exportReport(exportColumns)}
        />
      ) : null}
    </>
  );
}
