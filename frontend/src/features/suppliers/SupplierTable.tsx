import type { Supplier } from '../../types/suppliers';
import { formatMoney } from '../products/money';

interface SupplierTableProps {
  suppliers: Supplier[];
  busy: boolean;
  onEdit: (supplier: Supplier) => void;
}

/** Listado de proveedores con su contacto y los productos que suministran (HU-21). */
export function SupplierTable({ suppliers, busy, onEdit }: SupplierTableProps) {
  if (suppliers.length === 0) {
    return (
      <section className="card">
        <header className="card__header">
          <h2>Proveedores</h2>
        </header>
        <p className="muted">Todavía no hay proveedores. Use «+ Nuevo proveedor».</p>
      </section>
    );
  }

  return (
    <section className="card">
      <header className="card__header">
        <h2>Proveedores</h2>
        <span className="muted">{suppliers.length} proveedor(es)</span>
      </header>

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Contacto</th>
              <th>Productos que suministra</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((supplier) => (
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
    </section>
  );
}
