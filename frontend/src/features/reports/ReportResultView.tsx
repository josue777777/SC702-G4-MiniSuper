import type { ReportResult } from '../../types/reports';
import { formatReportMoney } from './report-format';
import type { ExportNotice } from './use-commercial-report';

interface ReportResultViewProps {
  report: ReportResult;
  exporting: boolean;
  notice: ExportNotice | null;
  onExport: () => void;
  onDismissNotice: () => void;
}

/**
 * Un reporte ya generado: filtros aplicados, totales, reglas y límites, y las
 * filas (o el estado vacío). Es el mismo resultado que recibe el Excel.
 */
export function ReportResultView({
  report,
  exporting,
  notice,
  onExport,
  onDismissNotice,
}: ReportResultViewProps) {
  return (
    <div className="report-result">
      <header className="card__header">
        <h3>{report.title}</h3>
        <span className="card__header-end">
          <button
            type="button"
            className="button"
            onClick={onExport}
            disabled={exporting}
            aria-label={`Exportar ${report.title.toLowerCase()} a Excel`}
          >
            {exporting ? 'Exportando…' : 'Exportar a Excel'}
          </button>
        </span>
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

      <p className="muted report-result__filters">
        {report.filters.map((filter) => `${filter.label}: ${filter.value}`).join(' · ')}
      </p>

      <div className="stat-grid" aria-label="Totales del reporte">
        {report.totals.map((total) => (
          <div key={total.label} className="stat-tile">
            <span className="stat-tile__label">{total.label}</span>
            <strong className="stat-tile__value">
              {total.money === true ? formatReportMoney(total.value) : total.value}
            </strong>
          </div>
        ))}
      </div>

      <div className="alert alert--warning report-result__notices" role="note">
        <div>
          <strong>Cómo leer este reporte</strong>
          <ul>
            {report.notices.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
      </div>

      {report.rows.length === 0 ? (
        <p className="muted" role="status">
          {report.emptyMessage}
        </p>
      ) : (
        <div className="table-wrapper">
          <table className="table table--compact" aria-label={report.title}>
            <thead>
              <tr>
                {report.columns.map((column) => (
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
                  {report.columns.map((column) => (
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
