import { useState } from 'react';
import { Pagination } from '../../components/Pagination';
import { usePagination } from '../../components/use-pagination';
import type { Supplier } from '../../types/suppliers';
import { SupplierProductsModal } from './SupplierProductsModal';

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
 * En páginas de 20. La celda de productos solo dice cuántos son («12
 * productos»); la lista se abre en una ventana (`SupplierProductsModal`), así
 * la fila nunca crece ni la pantalla salta al abrirla (regla 4 de PANTALLAS.md).
 */
export function SupplierTable({ suppliers, totalCount, search, busy, onEdit }: SupplierTableProps) {
  const pages = usePagination(suppliers, search);
  /** Proveedor cuyos productos se están viendo; `null` = ventana cerrada. */
  const [viewing, setViewing] = useState<Supplier | null>(null);

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
                    <button
                      type="button"
                      className="button"
                      aria-label={`Ver los productos de ${supplier.name}`}
                      onClick={() => setViewing(supplier)}
                    >
                      {supplier.products.length}{' '}
                      {supplier.products.length === 1 ? 'producto' : 'productos'}
                    </button>
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

      {viewing === null ? null : (
        <SupplierProductsModal supplier={viewing} onClose={() => setViewing(null)} />
      )}
    </section>
  );
}
