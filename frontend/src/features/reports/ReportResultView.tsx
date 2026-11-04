import type {
  ReportColumn,
  ReportFilter,
  ReportKind,
  ReportSummary,
  ReportTotal,
} from '../../types/reports';
import { ReportActions } from './ReportActions';
import { ReportChartView } from './ReportChartView';
import { ReportDetail } from './ReportDetail';
import { formatReportMoney } from './report-format';
import type { ExportNotice } from './use-commercial-report';

interface ReportResultViewProps {
  report: ReportSummary;
  /** Filtros con que se generó: «Ver detalle» pide sus páginas con los mismos. */
  filter: ReportFilter;
  /** Columnas que el usuario dejó activas al personalizar (HU-40). */
  columns: ReportColumn[];
  exporting: boolean;
  notice: ExportNotice | null;
  onExport: () => void;
  onPdf: () => void;
  onCustomize: () => void;
  onDismissNotice: () => void;
}

/** Qué responde cada reporte, en una línea, bajo su título. */
const DESCRIPTIONS: Record<ReportKind, string> = {
  sales: 'Lo vendido en el período, línea por línea, con devoluciones.',
  profits: 'Cuánto se ganó con lo cobrado en el período.',
  'top-products': 'Los productos que más se vendieron en el período.',
  'customer-debts': 'Lo que deben hoy los clientes por ventas fiadas.',
};

/**
 * Un reporte ya generado: filtros aplicados, totales, avisos y las filas (o el
 * estado vacío). Es el mismo resultado que recibe el Excel.
 *
 * Poco texto en pantalla (docs/PANTALLAS.md): el dato principal destacado y el
 * resto como detalle; los avisos solo cuando aplican a este resultado; y la
 * explicación del cálculo, con sus notas técnicas completas, a pedido.
 */
export function ReportResultView({
  report,
  filter,
  columns,
  exporting,
  notice,
  onExport,
  onPdf,
  onCustomize,
  onDismissNotice,
}: ReportResultViewProps) {
  const appliedFilters = report.filters.filter((filter) => filter.isDefault !== true);
  const primary = report.totals.filter((total) => total.primary === true);
  const secondary = report.totals.filter((total) => total.primary !== true);

  return (
    <div className="report-result">
      <header className="report-result__header">
        <div>
          <h3>{report.title}</h3>
          <p className="muted">{DESCRIPTIONS[report.kind]}</p>
        </div>
        <ReportActions
          title={report.title}
          emptyReason={
            report.rowCount === 0 ? 'Sin datos: no hay nada que exportar con estos filtros.' : null
          }
          exportingExcel={exporting}
          onPdf={onPdf}
          onExcel={onExport}
          onCustomize={onCustomize}
        />
      </header>

      {notice === null ? null : (
        <div
          className={`alert ${notice.kind === 'success' ? 'alert--success' : 'alert--error'}`}
          role={notice.kind === 'success' ? 'status' : 'alert'}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            className="alert__close"
            aria-label="Cerrar aviso"
            onClick={onDismissNotice}
          >
            ×
          </button>
        </div>
      )}

      {/* Solo los filtros que se eligieron: los «Todas» o «Sin mínimo» no aportan. */}
      <p className="muted report-result__filters">
        {appliedFilters.map((filter) => `${filter.label}: ${filter.value}`).join(' · ')}
      </p>

      <div className="report-totals" aria-label="Totales del reporte">
        {primary.map((total) => (
          <div key={total.label} className="stat-tile stat-tile--primary">
            <span className="stat-tile__label">{total.label}</span>
            <strong className="stat-tile__value">{formatTotal(total)}</strong>
          </div>
        ))}
        {secondary.length === 0 ? null : (
          <div className="report-totals__secondary">
            {secondary.map((total) => (
              <div key={total.label} className="stat-tile stat-tile--secondary">
                <span className="stat-tile__label">{total.label}</span>
                <strong className="stat-tile__value">{formatTotal(total)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Avisos que aplican a ESTE resultado: si aparecen, hay algo que revisar. */}
      {report.warnings.map((warning) => (
        <p key={warning} className="alert alert--warning" role="alert">
          {warning}
        </p>
      ))}

      <details className="disclosure report-result__help">
        <summary>ⓘ Cómo se calcula</summary>
        <ul>
          {report.help.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
        {/* El detalle completo para quien lo necesite; también va en el Excel. */}
        <details className="disclosure report-result__notices">
          <summary>Notas técnicas</summary>
          <ul>
            {report.notices.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </details>
      </details>

      {report.rowCount === 0 ? (
        <p className="muted" role="status">
          {report.emptyMessage}
        </p>
      ) : (
        <>
          {/* En pantalla, lo que ayuda a decidir: gráficos. El detalle va a pedido. */}
          <div className="report-charts">
            {report.charts.map((chart) => (
              <ReportChartView key={chart.id} chart={chart} />
            ))}
          </div>

          {/* Las filas se piden al abrir el detalle, de a una página. */}
          <ReportDetail
            key={report.generatedAt}
            report={report}
            filter={filter}
            columns={columns}
          />
        </>
      )}
    </div>
  );
}

function formatTotal(total: ReportTotal): string | number {
  return total.money === true ? formatReportMoney(total.value) : total.value;
}
