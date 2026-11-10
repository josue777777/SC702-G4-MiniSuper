import { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { ApiError } from '../../services/api-client';
import { reportsService } from '../../services/reports.service';
import type { ReportColumn, ReportFilter, ReportResult, ReportSummary } from '../../types/reports';
import { formatDateTime } from '../inventory/inventory-count';
import { formatReportMoney } from './report-format';
import { printReport, type Orientation } from './report-preferences';

/**
 * Desde cuántas filas se pregunta antes de armar el PDF: a ~40 filas por hoja,
 * 1.000 filas ya son unas 25 hojas. Para revisar tanto, el Excel sirve más
 * (se filtra y se ordena); el PDF se puede generar igual si se confirma.
 */
export const LARGE_PDF_ROWS = 1000;

interface ReportPdfPreviewProps {
  report: ReportSummary;
  /** Filtros con que se generó: el PDF pide todas sus filas con los mismos. */
  filter: ReportFilter;
  /** Solo las columnas que el usuario dejó activas. */
  columns: ReportColumn[];
  orientation: Orientation;
  onClose: () => void;
  /** Descargar el Excel en lugar del PDF (se ofrece cuando el reporte es muy largo). */
  onExcel: () => void;
}

type RowsState =
  | { status: 'confirm' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; rows: ReportResult['rows'] };

/**
 * PDF de un reporte (HU-40): una vista previa de la hoja tal como sale, con
 * «Imprimir / Guardar PDF». Usa el diálogo del navegador (igual que el reporte
 * de inventario), que permite imprimir o elegir «Guardar como PDF».
 *
 * Lleva los mismos filtros, totales, avisos y columnas que la pantalla.
 */
export function ReportPdfPreview({
  report,
  filter,
  columns,
  orientation,
  onClose,
  onExcel,
}: ReportPdfPreviewProps) {
  const filters = report.filters.filter((entry) => entry.isDefault !== true);
  const [state, setState] = useState<RowsState>(() =>
    report.rowCount > LARGE_PDF_ROWS ? { status: 'confirm' } : { status: 'loading' },
  );

  // El PDF es el documento completo: pide TODAS las filas (la pantalla solo tiene una página).
  useEffect(() => {
    if (state.status !== 'loading') {
      return;
    }

    let active = true;

    reportsService
      .allRows(report.kind, filter)
      .then((page) => {
        if (active) setState({ status: 'ready', rows: page.rows });
      })
      .catch((caught: unknown) => {
        if (active) {
          setState({
            status: 'error',
            message: caught instanceof ApiError ? caught.message : 'No se pudo preparar el PDF.',
          });
        }
      });

    return () => {
      active = false;
    };
  }, [state.status, report.kind, filter]);

  if (state.status !== 'ready') {
    return (
      <Modal title={`Vista previa: ${report.title}`} onClose={onClose}>
        {state.status === 'confirm' ? (
          <>
            <p>
              Este reporte tiene <strong>{report.rowCount.toLocaleString('es-CR')} filas</strong>:
              el PDF tendría unas {Math.ceil(report.rowCount / 40).toLocaleString('es-CR')} hojas.
            </p>
            <p className="muted">
              Para revisar tantas filas conviene el Excel: se puede buscar, filtrar y ordenar.
            </p>
            <div className="form__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={() => {
                  onExcel();
                  onClose();
                }}
              >
                Descargar Excel
              </button>
              <button
                type="button"
                className="button"
                onClick={() => setState({ status: 'loading' })}
              >
                Generar el PDF igual
              </button>
              <button type="button" className="button" onClick={onClose}>
                Cancelar
              </button>
            </div>
          </>
        ) : null}
        {state.status === 'loading' ? (
          <p className="muted" role="status">
            Preparando el PDF…
          </p>
        ) : null}
        {state.status === 'error' ? (
          <div className="alert alert--error" role="alert">
            {state.message}
          </div>
        ) : null}
      </Modal>
    );
  }

  const rows = state.rows;

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
            {rows.map((row, index) => (
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
