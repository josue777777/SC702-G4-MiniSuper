import type { ReportColumn, ReportKind, ReportResult, ReportTotal } from '../../types/reports';
import { ReportActions } from './ReportActions';
import { formatReportMoney } from './report-format';
import type { ExportNotice } from './use-commercial-report';

interface ReportResultViewProps {
  report: ReportResult;
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
            report.rows.length === 0
              ? 'Sin datos: no hay nada que exportar con estos filtros.'
              : null
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

      {report.rows.length === 0 ? (
        <p className="muted" role="status">
          {report.emptyMessage}
        </p>
      ) : (
        <div className="table-wrapper">
          <table className="table table--compact" aria-label={report.title}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={isNumeric(report, column.key) ? 'table__number' : undefined}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row, index) => (
                <tr key={index}>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={isNumeric(report, column.key) ? 'table__number' : undefined}
                    >
                      {column.money === true
                        ? formatReportMoney(row[column.key] ?? '')
                        : (row[column.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Importes y cantidades se alinean a la derecha. */
function isNumeric(report: ReportResult, key: string): boolean {
  const column = report.columns.find((entry) => entry.key === key);

  return column?.money === true || report.rows.some((row) => typeof row[key] === 'number');
}

function formatTotal(total: ReportTotal): string | number {
  return total.money === true ? formatReportMoney(total.value) : total.value;
}
