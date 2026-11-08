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
}

/**
 * El documento completo del reporte de inventario (HU-25, con stock bajo de
 * HU-08 y vencimientos de HU-09) para el PDF: todas las filas, con los grupos
 * por categoría y sus subtotales. En pantalla, el detalle va por páginas
 * (`InventoryReportDetail`).
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
}: InventoryReportDocumentProps) {
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
              {groups.map((group) => (
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
                  <th>Lote</th>
                  <th className="table__number">Unidades del lote</th>
                  <th>Vence</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {expirations.map((alert) => (
                  <tr key={`${alert.productId}-${alert.lotNumber}-${alert.expirationDate}`}>
                    <td>{alert.productCode}</td>
                    <td>{alert.productName}</td>
                    <td className="table__number">{alert.stock}</td>
                    <td>{alert.lotNumber}</td>
                    <td className="table__number">{alert.lotQuantity}</td>
                    <td>{formatDateOnly(alert.expirationDate)}</td>
                    <td>{describeExpiration(alert.daysLeft)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
                {lowStock.map((alert) => (
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
        </section>
      ) : null}
    </>
  );
}
