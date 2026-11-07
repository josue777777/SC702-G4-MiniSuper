import { Pagination } from '../../components/Pagination';
import { reportsService } from '../../services/reports.service';
import type {
  ReportColumn,
  ReportFilter,
  ReportRowsPage,
  ReportSummary,
} from '../../types/reports';
import { formatReportMoney } from './report-format';
import { usePagedRows } from './use-paged-rows';

interface ReportDetailProps {
  report: ReportSummary;
  /** Filtros con que se generó el reporte: las páginas se piden con los mismos. */
  filter: ReportFilter;
  /** Columnas que el usuario dejó activas al personalizar (HU-40). */
  columns: ReportColumn[];
  /** Abierto o cerrado lo recuerda quien lo usa: así no se cierra al filtrar. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * «Ver detalle»: las filas del reporte, cerradas hasta que se piden.
 *
 * Las filas NO vienen con el reporte: al abrir el detalle se piden al servidor
 * de a 15 (`GET /api/reports/commercial/:kind/rows`). Con un año de ventas, la
 * pantalla nunca recibe ni dibuja más que una página. Los números de página
 * permiten ir directo a la última o a una del medio.
 *
 * Se monta con `key` = el reporte generado: al regenerarlo, empieza de cero.
 */
export function ReportDetail({ report, filter, columns, open, onOpenChange }: ReportDetailProps) {
  const rows = usePagedRows(
    (page, pageSize) => reportsService.rows(report.kind, filter, page, pageSize),
    open,
  );
  const { data, view, loading } = rows;

  return (
    <details
      className="disclosure report-detail"
      open={open}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
    >
      <summary>Ver detalle ({report.rowCount} filas)</summary>

      {view.status === 'error' ? (
        <div className="alert alert--error" role="alert">
          <span>{view.message}</span>
          <button type="button" className="button" onClick={rows.retry}>
            Reintentar
          </button>
        </div>
      ) : null}

      {data === null || rows.pagination === null ? (
        loading ? (
          <p className="muted" role="status">
            Cargando filas…
          </p>
        ) : null
      ) : (
        <>
          <div className="table-wrapper" aria-busy={loading}>
            <table
              className={`table table--compact${loading ? ' table--loading' : ''}`}
              aria-label={report.title}
            >
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className={isNumeric(column, data.rows) ? 'table__number' : undefined}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, index) => (
                  <tr key={`${data.page}-${index}`}>
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={isNumeric(column, data.rows) ? 'table__number' : undefined}
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
          <Pagination {...rows.pagination} itemLabel="filas" busy={loading} onPage={rows.setPage} />
          <p className="muted">El PDF y el Excel llevan todas las filas.</p>
        </>
      )}
    </details>
  );
}

/** Importes y cantidades se alinean a la derecha. */
function isNumeric(column: ReportColumn, rows: ReportRowsPage['rows']): boolean {
  return column.money === true || rows.some((row) => typeof row[column.key] === 'number');
}
