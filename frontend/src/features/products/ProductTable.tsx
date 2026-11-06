import { useEffect, type KeyboardEvent, type ReactNode } from 'react';
import { Pagination } from '../../components/Pagination';
import { usePagination } from '../../components/use-pagination';
import type { Product } from '../../types/products';
import { formatMoney } from './money';

interface ProductTableProps {
  products: Product[];
  /** `true` si hay un filtro de categoría activo (solo se muestran productos activos). */
  filtered?: boolean;
  /** Búsqueda confirmada (HU-05); cadena vacía si no hay búsqueda. */
  searchTerm?: string;
  /** Mensaje de lista vacía que decide la vista (activos o desactivados). */
  emptyText?: string;
  /** Controles del encabezado, a la derecha del título (p. ej. el selector de vista). */
  headerActions?: ReactNode;
  /** Producto marcado en la lista; sobre él actúan «Modificar» y «Desactivar». */
  selectedId: string | null;
  onSelect: (product: Product) => void;
  /** Doble clic o Enter sobre una fila: abrir el producto para modificarlo. */
  onOpen: (product: Product) => void;
  /** Cambia con la vista, la categoría o la búsqueda: vuelve a la página 1. */
  pageResetKey?: string;
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
 *
 * Se muestra en páginas de 20. Si el producto marcado queda en otra página
 * (por ejemplo, uno recién creado), la tabla salta a la suya.
 */
export function ProductTable({
  products,
  filtered = false,
  searchTerm = '',
  emptyText,
  headerActions,
  selectedId,
  onSelect,
  onOpen,
  pageResetKey = '',
}: ProductTableProps) {
  const searching = searchTerm !== '';
  const pages = usePagination(products, pageResetKey);
  const { pageSize, setPage } = pages;

  // Ir a la página del producto marcado cuando la marca viene de fuera de la tabla.
  useEffect(() => {
    const index = products.findIndex((product) => product.id === selectedId);

    if (index >= 0) {
      setPage(Math.floor(index / pageSize) + 1);
    }
    // Solo al cambiar la marca: si dependiera de `products`, no dejaría pasar de página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

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
          {headerActions}
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
            {emptyText ??
              (filtered
                ? 'No hay productos activos en esta categoría.'
                : 'Todavía no hay productos registrados. Use «+ Crear» para registrar el primero.')}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="card">
      <header className="card__header">
        <h2>{searching ? 'Resultados de la búsqueda' : 'Catálogo'}</h2>
        <span className="card__header-end">
          <span className="muted" role="status">
            {products.length} {searching ? 'resultado(s)' : 'producto(s)'}
          </span>
          {headerActions}
        </span>
      </header>

      <div className="table-wrapper">
        <table className="table" aria-label="Productos del inventario">
          <thead>
            <tr>
              <th>Código</th>
              <th>Código de barras</th>
              <th>Nombre</th>
              <th>Categoría</th>
              {/* Compra = lo que cuesta al negocio (cost); venta = lo que paga el cliente (price). */}
              <th className="table__number" title="Lo que le cuesta al negocio (costo)">
                Precio compra
              </th>
              <th className="table__number" title="Lo que paga el cliente">
                Precio venta
              </th>
              <th className="table__number">Stock</th>
              <th>Proveedor</th>
            </tr>
          </thead>
          <tbody>
            {pages.pageItems.map((product) => {
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
                  <td>{product.barcode ?? '—'}</td>
                  <td>
                    {product.name}
                    {/*
                      El gris de la fila ya marca lo desactivado; la etiqueta lo dice también en
                      palabras, porque el color solo no se ve impreso ni para quien no distingue
                      bien los colores.
                    */}
                    {product.isActive ? null : (
                      <>
                        {' '}
                        <span className="badge badge--muted">desactivado</span>
                      </>
                    )}
                  </td>
                  <td>{product.categoryName}</td>
                  <td className="table__number">{formatMoney(product.cost)}</td>
                  <td className="table__number">{formatMoney(product.price)}</td>
                  <td className="table__number">{product.stock}</td>
                  <td>{product.preferredSupplierName ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination {...pages} itemLabel="productos" onPage={setPage} />
    </section>
  );
}
