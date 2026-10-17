import type { KeyboardEvent } from 'react';
import type { Product } from '../../types/products';
import { formatMoney } from './money';

interface ProductTableProps {
  products: Product[];
  /** `true` si hay un filtro de categoría activo (solo se muestran productos activos). */
  filtered?: boolean;
  /** Búsqueda confirmada (HU-05); cadena vacía si no hay búsqueda. */
  searchTerm?: string;
  /** Producto marcado en la lista; sobre él actúan «Modificar» y «Desactivar». */
  selectedId: string | null;
  onSelect: (product: Product) => void;
  /** Doble clic o Enter sobre una fila: abrir el producto para modificarlo. */
  onOpen: (product: Product) => void;
}

/**
 * Catálogo en forma de tabla (HU-01, HU-02, HU-03, HU-05), como la ventana de
 * inventario de un sistema de escritorio: un clic marca el producto y las
 * acciones están en la barra inferior; doble clic lo abre para modificarlo.
 *
 * Sin filtros muestra también los productos inactivos: es la pantalla de
 * administración, y ver el estado es lo que permite comprobar que la
 * desactivación funcionó. Con filtro de categoría o búsqueda solo llegan
 * activos. Las consultas de venta (HU-16) sí filtrarán siempre por activos.
 */
export function ProductTable({
  products,
  filtered = false,
  searchTerm = '',
  selectedId,
  onSelect,
  onOpen,
}: ProductTableProps) {
  const searching = searchTerm !== '';

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>, product: Product): void {
    if (event.key === 'Enter') {
      onOpen(product);
    } else if (event.key === ' ') {
      event.preventDefault();
      onSelect(product);
    }
  }

  if (products.length === 0) {
    return (
      <section className="card">
        <header className="card__header">
          <h2>{searching ? 'Resultados de la búsqueda' : 'Catálogo'}</h2>
        </header>
        {searching ? (
          <>
            <p role="status">
              No se encontraron productos activos que coincidan con «{searchTerm}»
              {filtered ? ' en esta categoría' : ''}.
            </p>
            <p className="muted hint">
              Revise cómo está escrito el nombre o el código del producto.
            </p>
          </>
        ) : (
          <p className="muted">
            {filtered
              ? 'No hay productos activos en esta categoría.'
              : 'Todavía no hay productos registrados. Use «+ Crear» para registrar el primero.'}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="card">
      <header className="card__header">
        <h2>{searching ? 'Resultados de la búsqueda' : 'Catálogo'}</h2>
        <span className="muted" role="status">
          {products.length} {searching ? 'resultado(s)' : 'producto(s)'}
        </span>
      </header>

      <div className="table-wrapper">
        <table className="table" aria-label="Productos del inventario">
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
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const selected = product.id === selectedId;
              const classes = [
                'table__row--selectable',
                product.isActive ? '' : 'table__row--inactive',
                selected ? 'table__row--selected' : '',
              ];

              return (
                <tr
                  key={product.id}
                  className={classes.filter(Boolean).join(' ')}
                  tabIndex={0}
                  aria-selected={selected}
                  onClick={() => onSelect(product)}
                  onDoubleClick={() => onOpen(product)}
                  onKeyDown={(event) => handleKeyDown(event, product)}
                >
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
