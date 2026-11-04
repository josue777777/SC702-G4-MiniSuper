import { Pagination } from '../../components/Pagination';
import { usePagination } from '../../components/use-pagination';
import type { ExpirationAlert, LowStockAlert } from '../../types/inventory';
import type { Product } from '../../types/products';
import { describeExpiration, formatDateOnly } from '../inventory/inventory-count';
import {
  EXPIRATION_FILTERS,
  summarize,
  type ExpirationFilter,
  type InventorySections,
  type ProductGroup,
  type ReportColumn as InventoryColumn,
} from './inventory-report';

interface InventoryReportDocumentProps {
  sections: InventorySections;
  /** «todas las categorías» o «categoría Bebidas». */
  scope: string;
  columns: InventoryColumn[];
  products: Product[];
  groups: ProductGroup[];
  expirations: ExpirationAlert[];
  expirationFilter: ExpirationFilter;
  lowStock: LowStockAlert[];
  /**
   * En pantalla, de 20 en 20 (docs/PANTALLAS.md: no se muestran datos por
   * mostrar). En el PDF, completo y con los grupos y subtotales.
   */
  paginated?: boolean;
}

/**
 * El contenido del reporte de inventario (HU-25, con stock bajo de HU-08 y
 * vencimientos de HU-09): el mismo en pantalla y en el PDF.
 */
export function InventoryReportDocument({
  sections,
  scope,
  columns,
  products,
  groups,
  expirations,
  expirationFilter,
  lowStock,
  paginated = false,
}: InventoryReportDocumentProps) {
  const productPages = usePagination(products, `${scope}/${products.length}`);
  const expirationPages = usePagination(expirations, `${scope}/${expirationFilter}`);
  const lowStockPages = usePagination(lowStock, scope);
  // En pantalla, una lista plana paginada; los grupos con subtotales quedan para el PDF.
  const shownGroups: ProductGroup[] = paginated
    ? [{ key: 'page', title: null, products: productPages.pageItems }]
    : groups;
  const shownExpirations = paginated ? expirationPages.pageItems : expirations;
  const shownLowStock = paginated ? lowStockPages.pageItems : lowStock;
  const grouped = groups.some((group) => group.title !== null);

  return (
    <>
      {sections.products ? (
        <section className="report-preview__section">
          <h2>Productos</h2>
          {products.length === 0 ? (
            <p className="muted" role="status">
              No hay productos activos en {scope}.
            </p>
          ) : (
            <table className="table table--compact" aria-label="Stock de productos">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} className={column.numeric ? 'table__number' : undefined}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              {shownGroups.map((group) => (
                <tbody key={group.key}>
                  {group.title === null ? null : (
                    <tr className="report-preview__group">
                      <th colSpan={columns.length}>{group.title}</th>
                    </tr>
                  )}
                  {group.products.map((product) => (
                    <tr key={product.id}>
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={column.numeric ? 'table__number' : undefined}
                        >
                          {column.render(product)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {/* Una sola celda a lo ancho: no se desalinea al ocultar columnas. */}
                  {group.title === null ? null : (
                    <tr className="report-preview__subtotal">
                      <td colSpan={columns.length}>
                        Subtotal {group.title}: {summarize(group.products)}
                      </td>
                    </tr>
                  )}
                </tbody>
              ))}
              <tfoot>
                <tr>
                  <th colSpan={columns.length}>Total: {summarize(products)}</th>
                </tr>
              </tfoot>
            </table>
          )}
          {paginated ? (
            <>
              <Pagination {...productPages} itemLabel="productos" onPage={productPages.setPage} />
              {grouped ? (
                <p className="muted">
                  La agrupación por categoría, con subtotales, se ve en el PDF.
                </p>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {sections.expirations ? (
        <section className="report-preview__section">
          <h2>{EXPIRATION_FILTERS[expirationFilter]}</h2>
          {expirations.length === 0 ? (
            <p className="muted">Ningún producto en esta sección.</p>
          ) : (
            <table className="table table--compact" aria-label="Vencimientos">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th className="table__number">Stock</th>
                  <th>Vence</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {shownExpirations.map((alert) => (
                  <tr key={alert.productId}>
                    <td>{alert.productCode}</td>
                    <td>{alert.productName}</td>
                    <td className="table__number">{alert.stock}</td>
                    <td>{formatDateOnly(alert.expirationDate)}</td>
                    <td>{describeExpiration(alert.daysLeft)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {paginated ? (
            <Pagination
              {...expirationPages}
              itemLabel="productos"
              onPage={expirationPages.setPage}
            />
          ) : null}
        </section>
      ) : null}

      {sections.lowStock ? (
        <section className="report-preview__section">
          <h2>Stock bajo</h2>
          {lowStock.length === 0 ? (
            <p className="muted">Ningún producto está en su mínimo de stock.</p>
          ) : (
            <table className="table table--compact" aria-label="Stock bajo">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th className="table__number">Stock</th>
                  <th className="table__number">Mínimo</th>
                </tr>
              </thead>
              <tbody>
                {shownLowStock.map((alert) => (
                  <tr key={alert.productId}>
                    <td>{alert.productCode}</td>
                    <td>{alert.productName}</td>
                    <td className="table__number">{alert.stock}</td>
                    <td className="table__number">{alert.minStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {paginated ? (
            <Pagination {...lowStockPages} itemLabel="productos" onPage={lowStockPages.setPage} />
          ) : null}
        </section>
      ) : null}
    </>
  );
}
