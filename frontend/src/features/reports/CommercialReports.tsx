import type { ReportKind } from '../../types/reports';
import { ReportFilters } from './ReportFilters';
import { ReportResultView } from './ReportResultView';
import { useCommercialReport } from './use-commercial-report';

const TABS: { kind: ReportKind; label: string; stories: string }[] = [
  { kind: 'sales', label: 'Ventas', stories: 'HU-28' },
  { kind: 'profits', label: 'Ganancias', stories: 'HU-29' },
  { kind: 'top-products', label: 'Más vendidos', stories: 'HU-30' },
  { kind: 'customer-debts', label: 'Deudas de clientes', stories: 'HU-30' },
];

/**
 * Reportes comerciales del negocio (HU-28 ventas, HU-29 ganancias, HU-30
 * productos más vendidos y deudas de clientes). Solo se monta con el permiso
 * `reports.sales`; la API lo exige además en cada consulta.
 */
export function CommercialReports() {
  const report = useCommercialReport();
  const { view } = report;

  return (
    <section className="card" aria-labelledby="commercial-reports-title">
      <header className="card__header">
        <h2 id="commercial-reports-title">Reportes comerciales</h2>
      </header>

      <div className="tabs" role="tablist" aria-label="Reportes comerciales">
        {TABS.map((tab) => (
          <button
            key={tab.kind}
            type="button"
            role="tab"
            id={`report-tab-${tab.kind}`}
            aria-selected={report.kind === tab.kind}
            aria-controls="report-panel"
            title={tab.stories}
            className={`tabs__tab${report.kind === tab.kind ? ' tabs__tab--active' : ''}`}
            onClick={() => report.selectKind(tab.kind)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        id="report-panel"
        role="tabpanel"
        aria-labelledby={`report-tab-${report.kind}`}
        className="tabs__panel"
      >
        <ReportFilters
          kind={report.kind}
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

        {view.status === 'ready' ? (
          <ReportResultView
            report={view.report}
            exporting={report.exporting}
            notice={report.notice}
            onExport={() => void report.exportReport()}
            onDismissNotice={report.dismissNotice}
          />
        ) : null}
      </div>
    </section>
  );
}
