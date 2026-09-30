import { Fragment, useState } from 'react';
import type { Product } from '../../types/products';
import { formatMoney } from './money';

interface ProductTableProps {
  products: Product[];
  busy: boolean;
  onEdit: (product: Product) => void;
  onDeactivate: (product: Product) => void;
}

/** Cuántas columnas tiene la tabla: lo necesita la fila de confirmación. */
const COLUMN_COUNT = 9;

/**
 * Catálogo en forma de tabla (HU-01, HU-02, HU-03).
 *
 * Muestra también los productos inactivos: es la pantalla de administración, y
 * ver el estado es lo que permite comprobar que la desactivación funcionó. Las
 * consultas de venta (HU-16) sí filtrarán por activos.
 *
 * La confirmación de la desactivación es estado local de este componente: si el
 * dueño cancela, no se llama a la API ni se toca nada (caso borde de HU-03).
 */
export function ProductTable({ products, busy, onEdit, onDeactivate }: ProductTableProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (products.length === 0) {
    return (
      <section className="card">
        <header className="card__header">
          <h2>Catálogo</h2>
        </header>
        <p className="muted">
          Todavía no hay productos registrados. Use «+ Nuevo producto» para registrar el primero.
        </p>
      </section>
    );
  }

  return (
    <section className="card">
      <header className="card__header">
        <h2>Catálogo</h2>
        <span className="muted">{products.length} producto(s)</span>
      </header>

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Categoría</th>
              <th className="table__number">Precio</th>
              <th className="table__number">Costo</th>
              <th className="table__number">Stock</th>
              <th>Proveedor</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <Fragment key={product.id}>
                <tr className={product.isActive ? undefined : 'table__row--inactive'}>
                  <td>{product.code}</td>
                  <td>{product.name}</td>
                  <td>{product.categoryName}</td>
                  <td className="table__number">{formatMoney(product.price)}</td>
                  <td className="table__number">{formatMoney(product.cost)}</td>
                  <td className="table__number">{product.stock}</td>
                  <td>{product.preferredSupplierName ?? '—'}</td>
                  <td>
                    {product.isActive ? (
                      <span className="badge badge--ok">Activo</span>
                    ) : (
                      <span className="badge badge--muted">Inactivo</span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="button"
                        disabled={busy}
                        onClick={() => onEdit(product)}
                      >
                        Editar
                      </button>
                      {product.isActive ? (
                        <button
                          type="button"
                          className="button button--danger"
                          disabled={busy}
                          onClick={() => setConfirmingId(product.id)}
                        >
                          Desactivar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>

                {confirmingId === product.id ? (
                  <tr className="table__confirm-row">
                    <td colSpan={COLUMN_COUNT}>
                      <div className="confirm">
                        <p>
                          ¿Desea desactivar <strong>{product.name}</strong>? Ya no estará disponible
                          para nuevas ventas; su historial de ventas e inventario se conserva.
                        </p>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="button button--danger"
                            disabled={busy}
                            onClick={() => {
                              setConfirmingId(null);
                              onDeactivate(product);
                            }}
                          >
                            Sí, desactivar
                          </button>
                          <button
                            type="button"
                            className="button"
                            disabled={busy}
                            onClick={() => setConfirmingId(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
