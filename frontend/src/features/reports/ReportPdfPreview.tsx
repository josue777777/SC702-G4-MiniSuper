import { Modal } from '../../components/Modal';
import type { ReportColumn, ReportResult } from '../../types/reports';
import { formatDateTime } from '../inventory/inventory-count';
import { formatReportMoney } from './report-format';
import { printReport, type Orientation } from './report-preferences';

interface ReportPdfPreviewProps {
  report: ReportResult;
  /** Solo las columnas que el usuario dejó activas. */
  columns: ReportColumn[];
  orientation: Orientation;
  onClose: () => void;
}

/**
 * PDF de un reporte (HU-40): una vista previa de la hoja tal como sale, con
 * «Imprimir / Guardar PDF». Usa el diálogo del navegador (igual que el reporte
 * de inventario), que permite imprimir o elegir «Guardar como PDF».
 *
 * Lleva los mismos filtros, totales, avisos y columnas que la pantalla.
 */
export function ReportPdfPreview({ report, columns, orientation, onClose }: ReportPdfPreviewProps) {
  const filters = report.filters.filter((filter) => filter.isDefault !== true);

  return (
    <Modal title={`Vista previa: ${report.title}`} size="wide" onClose={onClose}>
      {orientation === 'landscape' ? (
        <style>{'@media print { @page { size: landscape; } }'}</style>
      ) : null}

      <div className="form__actions report-pdf__actions">
        <button type="button" className="button button--primary" onClick={printReport}>
          🖨 Imprimir / Guardar PDF
        </button>
        <button type="button" className="button" onClick={onClose}>
          Cerrar
        </button>
        <span className="muted">
          En el diálogo, elija la impresora o «Guardar como PDF». Hoja{' '}
          {orientation === 'landscape' ? 'horizontal' : 'vertical'}.
        </span>
      </div>

      <article className="print-area report-preview report-pdf" aria-label="Documento del reporte">
        <header className="report-preview__header">
          <h1>{report.title}</h1>
          <p className="muted">
            {report.businessName} · generado el {formatDateTime(report.generatedAt)}
          </p>
          {filters.length === 0 ? null : (
            <p className="muted">
              {filters.map((filter) => `${filter.label}: ${filter.value}`).join(' · ')}
            </p>
          )}
        </header>

        <dl className="report-pdf__totals">
          {report.totals.map((total) => (
            <div key={total.label}>
              <dt>{total.label}</dt>
              <dd>{total.money === true ? formatReportMoney(total.value) : total.value}</dd>
            </div>
          ))}
        </dl>

        {report.warnings.map((warning) => (
          <p key={warning} className="report-pdf__warning">
            {warning}
          </p>
        ))}

        <table className="table table--compact">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={column.money === true ? 'table__number' : undefined}
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
                    className={
                      column.money === true || typeof row[column.key] === 'number'
                        ? 'table__number'
                        : undefined
                    }
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
      </article>
    </Modal>
  );
}
