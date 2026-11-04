import { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { ApiError } from '../../services/api-client';
import { reportsService } from '../../services/reports.service';
import type { ExpirationAlert, LowStockAlert } from '../../types/inventory';
import type { Product } from '../../types/products';
import type { InventoryReportOptions, InventoryReportSummary } from '../../types/reports';
import { formatDateTime } from '../inventory/inventory-count';
import {
  groupByCategory,
  type ExpirationFilter,
  type InventorySections,
  type ProductGroup,
  type ReportColumn,
} from './inventory-report';
import { InventoryReportDocument } from './InventoryReportDocument';
import { LARGE_PDF_ROWS } from './ReportPdfPreview';
import { printReport, type Orientation } from './report-preferences';

interface InventoryPdfPreviewProps {
  summary: InventoryReportSummary;
  /** Filtros con que se generó: el PDF pide todas sus filas con los mismos. */
  options: InventoryReportOptions;
  sections: InventorySections;
  /** «todas las categorías» o «categoría Bebidas». */
  scope: string;
  columns: ReportColumn[];
  /** Agrupar por categoría, con subtotales. */
  grouped: boolean;
  expirationFilter: ExpirationFilter;
  orientation: Orientation;
  /** Descargar el Excel en lugar del PDF (se ofrece cuando el reporte es muy largo). */
  onExcel: () => void;
  onClose: () => void;
}

interface Rows {
  products: Product[];
  expirations: ExpirationAlert[];
  lowStock: LowStockAlert[];
}

type State =
  | { status: 'confirm' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; rows: Rows };

/**
 * PDF del reporte de inventario (HU-25 / HU-40): el documento COMPLETO, con los
 * grupos por categoría y sus subtotales. La pantalla solo tiene una página de
 * cada sección, así que aquí se piden todas las filas de las secciones
 * elegidas. Si son muchísimas, primero se pregunta y se ofrece el Excel.
 */
export function InventoryPdfPreview({
  summary,
  options,
  sections,
  scope,
  columns,
  grouped,
  expirationFilter,
  orientation,
  onExcel,
  onClose,
}: InventoryPdfPreviewProps) {
  const totalRows =
    (sections.products ? summary.counts.products : 0) +
    (summary.counts.expirations ?? 0) +
    (summary.counts.lowStock ?? 0);
  const [state, setState] = useState<State>(() =>
    totalRows > LARGE_PDF_ROWS ? { status: 'confirm' } : { status: 'loading' },
  );

  useEffect(() => {
    if (state.status !== 'loading') {
      return;
    }

    let active = true;
    const none = Promise.resolve([]);

    Promise.all([
      sections.products ? reportsService.inventoryAllRows('products', options) : none,
      sections.expirations ? reportsService.inventoryAllRows('expirations', options) : none,
      sections.lowStock ? reportsService.inventoryAllRows('lowStock', options) : none,
    ])
      .then(([products, expirations, lowStock]) => {
        if (active) {
          setState({
            status: 'ready',
            rows: {
              products: products as Product[],
              expirations: expirations as ExpirationAlert[],
              lowStock: lowStock as LowStockAlert[],
            },
          });
        }
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
  }, [state.status, options, sections]);

  if (state.status !== 'ready') {
    return (
      <Modal title="Vista previa: Reporte de inventario" onClose={onClose}>
        {state.status === 'confirm' ? (
          <>
            <p>
              Este reporte tiene <strong>{totalRows.toLocaleString('es-CR')} filas</strong>: el PDF
              tendría unas {Math.ceil(totalRows / 40).toLocaleString('es-CR')} hojas.
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

  const { products, expirations, lowStock } = state.rows;
  const groups: ProductGroup[] = grouped
    ? groupByCategory(products)
    : [{ key: 'all', title: null, products }];

  return (
    <Modal title="Vista previa: Reporte de inventario" size="wide" onClose={onClose}>
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
      </div>
      <article className="print-area report-preview" aria-label="Documento del reporte">
        <header className="report-preview__header">
          <h1>Reporte de inventario</h1>
          <p className="muted">
            Productos activos · {scope} · generado el {formatDateTime(summary.generatedAt)}
          </p>
        </header>
        <InventoryReportDocument
          sections={sections}
          scope={scope}
          columns={columns}
          products={products}
          groups={groups}
          expirations={expirations}
          expirationFilter={expirationFilter}
          lowStock={lowStock}
        />
      </article>
    </Modal>
  );
}
