import { Pagination } from '../../components/Pagination';
import { usePagination } from '../../components/use-pagination';
import type { Supplier } from '../../types/suppliers';
import { formatMoney } from '../products/money';

interface SupplierTableProps {
  /** Proveedores que coinciden con la búsqueda. */
  suppliers: Supplier[];
  /** Total sin filtrar, para decir «3 de 24». */
  totalCount: number;
  search: string;
  busy: boolean;
  onEdit: (supplier: Supplier) => void;
}

/**
 * Listado de proveedores con su contacto y los productos que suministran (HU-21).
 *
 * En páginas de 20, y los productos de cada uno quedan plegados («12
 * productos»): se ven al abrirlos, así una fila no ocupa media pantalla.
 */
export function SupplierTable({ suppliers, totalCount, search, busy, onEdit }: SupplierTableProps) {
  const pages = usePagination(suppliers, search);

  if (totalCount === 0) {
    return (
      <section className="card">
        <header className="card__header">
          <h2>Proveedores</h2>
        </header>
        <p className="muted">Todavía no hay proveedores. Use «+ Nuevo proveedor».</p>
      </section>
    );
  }

  if (suppliers.length === 0) {
    return (
      <section className="card">
        <header className="card__header">
          <h2>Proveedores</h2>
        </header>
        <p className="muted">Ningún proveedor coincide con «{search}».</p>
      </section>
    );
  }

  return (
    <section className="card">
      <header className="card__header">
        <h2>Proveedores</h2>
        <span className="muted">
          {search === ''
            ? `${totalCount} proveedor(es)`
            : `${suppliers.length} de ${totalCount} proveedor(es)`}
        </span>
      </header>

      <div className="table-wrapper">
        <table className="table" aria-label="Proveedores">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Contacto</th>
              <th>Productos que suministra</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pages.pageItems.map((supplier) => (
              <tr key={supplier.id}>
                <td>
                  <strong>{supplier.name}</strong>
                  {supplier.contactName === null ? null : (
                    <div className="muted">{supplier.contactName}</div>
                  )}
                </td>
                <td>
                  {supplier.phone === null ? null : <div>{supplier.phone}</div>}
                  {supplier.email === null ? null : <div>{supplier.email}</div>}
                  {supplier.phone === null && supplier.email === null ? '—' : null}
                </td>
                <td>
                  {supplier.products.length === 0 ? (
                    <span className="muted">—</span>
                  ) : (
                    <details className="disclosure">
                      <summary>
                        {supplier.products.length}{' '}
                        {supplier.products.length === 1 ? 'producto' : 'productos'}
                      </summary>
                      <ul className="supplier-products">
                        {supplier.products.map((product) => (
                          <li key={product.productId}>
                            {product.productCode} — {product.productName} ·{' '}
                            {formatMoney(product.unitCost)}
                            {product.isPreferred ? (
                              <span className="badge badge--ok">principal</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={() => onEdit(supplier)}
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination {...pages} itemLabel="proveedores" onPage={pages.setPage} />
    </section>
  );
}
