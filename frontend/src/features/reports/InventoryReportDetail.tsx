import type { ReactNode } from 'react';
import { Pagination } from '../../components/Pagination';
import { reportsService, type InventoryRow } from '../../services/reports.service';
import type {
  InventoryReportOptions,
  InventoryReportSection,
  InventoryReportSummary,
  PageOf,
} from '../../types/reports';
import { describeExpiration, formatDateOnly } from '../inventory/inventory-count';
import { formatMoney } from '../products/money';
import { EXPIRATION_FILTERS, type ExpirationFilter, type ReportColumn } from './inventory-report';
import { usePagedRows } from './use-paged-rows';

interface InventoryReportDetailProps {
  summary: InventoryReportSummary;
  /** Filtros con que se generó: cada sección pide sus páginas con los mismos. */
  options: InventoryReportOptions;
  /** Columnas de productos que el usuario dejó activas (HU-40). */
  columns: ReportColumn[];
  /** «todas las categorías» o «categoría Bebidas». */
  scopeText: string;
  /** La agrupación con subtotales se arma en el PDF, que tiene todas las filas. */
  grouped: boolean;
  /** Abierto o cerrado lo recuerda quien lo usa: así no se cierra al filtrar. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * «Ver detalle» del reporte de inventario: cada sección elegida (productos,
 * vencimientos, stock bajo) con sus filas pedidas al servidor de a 20, y su
 * propia paginación. Nada se pide hasta que se abre el detalle.
 *
 * Mismo patrón que los reportes comerciales (`ReportDetail`). Se monta con
 * `key` = el reporte generado: al cambiar un filtro, empieza de cero.
 */
export function InventoryReportDetail({
  summary,
  options,
  columns,
  scopeText,
  grouped,
  open,
  onOpenChange,
}: InventoryReportDetailProps) {
  const { counts, totals } = summary;

  return (
    <details
      className="disclosure report-detail"
      open={open}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
    >
      <summary>Ver detalle ({counts.products} productos)</summary>

      {options.sections.includes('products') ? (
        <section className="report-preview__section">
          <h2>Productos</h2>
          <SectionTable
            section="products"
            options={options}
            enabled={open}
            empty={`No hay productos activos en ${scopeText}.`}
            label="Stock de productos"
            itemLabel="productos"
            head={columns.map((column) => (
              <th key={column.key} className={column.numeric ? 'table__number' : undefined}>
                {column.label}
              </th>
            ))}
            row={(product) => (
              <tr key={product.id}>
                {columns.map((column) => (
                  <td key={column.key} className={column.numeric ? 'table__number' : undefined}>
                    {column.render(product)}
                  </td>
                ))}
              </tr>
            )}
            foot={
              <tr>
                <th colSpan={columns.length}>
                  Total: {totals.count} producto(s) · {totals.units} unidad(es) · valor al costo{' '}
                  {formatMoney(totals.value)}
                </th>
              </tr>
            }
          />
          {grouped ? (
            <p className="muted">La agrupación por categoría, con subtotales, se ve en el PDF.</p>
          ) : null}
        </section>
      ) : null}

      {options.sections.includes('expirations') ? (
        <section className="report-preview__section">
          <h2>{EXPIRATION_FILTERS[options.expirations as ExpirationFilter]}</h2>
          <SectionTable
            section="expirations"
            options={options}
            enabled={open}
            empty="Ningún producto en esta sección."
            label="Vencimientos"
            itemLabel="productos"
            head={
              <>
                <th>Código</th>
                <th>Producto</th>
                <th className="table__number">Stock</th>
                <th>Vence</th>
                <th>Estado</th>
              </>
            }
            row={(alert) => (
              <tr key={alert.productId}>
                <td>{alert.productCode}</td>
                <td>{alert.productName}</td>
                <td className="table__number">{alert.stock}</td>
                <td>{formatDateOnly(alert.expirationDate)}</td>
                <td>{describeExpiration(alert.daysLeft)}</td>
              </tr>
            )}
          />
        </section>
      ) : null}

      {options.sections.includes('lowStock') ? (
        <section className="report-preview__section">
          <h2>Stock bajo</h2>
          <SectionTable
            section="lowStock"
            options={options}
            enabled={open}
            empty="Ningún producto está en su mínimo de stock."
            label="Stock bajo"
            itemLabel="productos"
            head={
              <>
                <th>Código</th>
                <th>Producto</th>
                <th className="table__number">Stock</th>
                <th className="table__number">Mínimo</th>
              </>
            }
            row={(alert) => (
              <tr key={alert.productId}>
                <td>{alert.productCode}</td>
                <td>{alert.productName}</td>
                <td className="table__number">{alert.stock}</td>
                <td className="table__number">{alert.minStock}</td>
              </tr>
            )}
          />
        </section>
      ) : null}

      <p className="muted">El PDF y el Excel llevan el detalle completo.</p>
    </details>
  );
}

interface SectionTableProps<S extends InventoryReportSection> {
  section: S;
  options: InventoryReportOptions;
  enabled: boolean;
  empty: string;
  /** Nombre de la tabla para lectores de pantalla (y para las pruebas). */
  label: string;
  itemLabel: string;
  head: ReactNode;
  row: (item: InventoryRow<S>) => ReactNode;
  foot?: ReactNode;
}

/** Una sección del detalle: su tabla, pedida de a una página, con su paginación. */
function SectionTable<S extends InventoryReportSection>({
  section,
  options,
  enabled,
  empty,
  label,
  itemLabel,
  head,
  row,
  foot,
}: SectionTableProps<S>) {
  const rows = usePagedRows<InventoryRow<S>>(
    (page, pageSize): Promise<PageOf<InventoryRow<S>>> =>
      reportsService.inventoryRows(section, options, page, pageSize),
    enabled,
  );
  const { data, view, loading } = rows;

  if (view.status === 'error') {
    return (
      <div className="alert alert--error" role="alert">
        <span>{view.message}</span>
        <button type="button" className="button" onClick={rows.retry}>
          Reintentar
        </button>
      </div>
    );
  }

  if (data === null || rows.pagination === null) {
    return loading ? (
      <p className="muted" role="status">
        Cargando filas…
      </p>
    ) : null;
  }

  if (data.total === 0) {
    return (
      <p className="muted" role="status">
        {empty}
      </p>
    );
  }

  return (
    <>
      <div className="table-wrapper" aria-busy={loading}>
        <table
          className={`table table--compact${loading ? ' table--loading' : ''}`}
          aria-label={label}
        >
          <thead>
            <tr>{head}</tr>
          </thead>
          <tbody>{data.rows.map(row)}</tbody>
          {foot === undefined ? null : <tfoot>{foot}</tfoot>}
        </table>
      </div>
      <Pagination
        {...rows.pagination}
        itemLabel={itemLabel}
        label={`Páginas de ${label.toLowerCase()}`}
        busy={loading}
        onPage={rows.setPage}
      />
    </>
  );
}
