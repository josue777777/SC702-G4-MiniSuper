import { useMemo, useState } from 'react';
import { ListSearch } from '../../components/ListSearch';
import { matchesSearch } from '../../components/list-search';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { MODAL_PAGE_SIZE, usePagination } from '../../components/use-pagination';
import type { Supplier } from '../../types/suppliers';
import { formatMoney } from '../products/money';

interface SupplierProductsModalProps {
  supplier: Supplier;
  onClose: () => void;
}

/** Desde cuántos productos vale la pena el buscador (con menos, se ven todos de una vez). */
const SEARCH_FROM = 8;

/**
 * Los productos que suministra UN proveedor, con su costo acordado (HU-21).
 *
 * Va en una ventana y no desplegado dentro de la tabla (regla 4 de
 * docs/PANTALLAS.md): un proveedor puede suministrar cientos de productos, y una
 * lista abierta dentro de la celda estira la fila y mueve la pantalla. Aquí la
 * lista tiene su buscador y sus páginas, y la tabla de proveedores no cambia de
 * tamaño.
 */
export function SupplierProductsModal({ supplier, onClose }: SupplierProductsModalProps) {
  const [search, setSearch] = useState('');
  const rows = useMemo(
    () =>
      supplier.products.filter((product) =>
        matchesSearch(search, product.productCode, product.productName),
      ),
    [supplier.products, search],
  );
  const pages = usePagination(rows, search, MODAL_PAGE_SIZE);

  return (
    <Modal title={`Productos de ${supplier.name}`} size="wide" onClose={onClose}>
      {supplier.products.length >= SEARCH_FROM ? (
        <div className="toolbar">
          <ListSearch
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nombre o código"
            label="Buscar producto del proveedor"
          />
        </div>
      ) : null}
      <div className="table-wrapper">
        <table className="table" aria-label={`Productos de ${supplier.name}`}>
          <thead>
            <tr>
              <th>Código</th>
              <th>Producto</th>
              <th className="table__number">Costo acordado</th>
              <th>Proveedor principal</th>
            </tr>
          </thead>
          <tbody>
            {pages.pageItems.map((product) => (
              <tr key={product.productId}>
                <td>{product.productCode}</td>
                <td>{product.productName}</td>
                <td className="table__number">{formatMoney(product.unitCost)}</td>
                <td>
                  {product.isPreferred ? <span className="badge badge--ok">principal</span> : '—'}
                </td>
              </tr>
            ))}
            {pages.total === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  Ningún producto coincide con «{search}».
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Pagination {...pages} itemLabel="productos" onPage={pages.setPage} />
      <p className="muted hint">
        «Principal» es el proveedor que Inventario usa para ese producto; se cambia al modificar el
        producto. Para quitar o agregar productos, use «Editar».
      </p>
      <div className="form__actions modal__actions">
        <button type="button" className="button" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
