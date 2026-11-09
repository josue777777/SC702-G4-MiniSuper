import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { MODAL_PAGE_SIZE, usePagination } from '../../components/use-pagination';
import type { KardexProduct, KardexStockLot } from '../../types/kardex';
import { formatLotDate } from './kardex-format';

/**
 * Lotes con unidades de UN producto, hoy (HU-38): número de lote, fecha de
 * vencimiento y unidades, del que vence primero (el que sale primero en una
 * venta) al último. Se abre desde la celda «Lotes» de la ficha. De 4 en 4
 * (regla 2), como la ventana de lotes de una línea del historial.
 */
export function ProductLotsModal({
  product,
  lots,
  onClose,
}: {
  product: KardexProduct;
  lots: KardexStockLot[];
  onClose: () => void;
}) {
  const pages = usePagination(lots, product.id, MODAL_PAGE_SIZE);

  return (
    <Modal title={`Lotes en existencia · ${product.name}`} onClose={onClose}>
      <p className="muted">
        {product.stock.toLocaleString('es-CR')} unidades en {lots.length}{' '}
        {lots.length === 1 ? 'lote' : 'lotes'}; sale primero el que vence antes.
      </p>
      <div className="table-wrapper">
        <table className="table" aria-label="Lotes del producto">
          <thead>
            <tr>
              <th>Lote</th>
              <th>Vence</th>
              <th className="table__number">Unidades</th>
            </tr>
          </thead>
          <tbody>
            {pages.pageItems.map((lot) => (
              <tr key={lot.id}>
                <td>{lot.lotNumber}</td>
                <td>
                  {lot.expirationDate === null ? 'Sin fecha' : formatLotDate(lot.expirationDate)}
                </td>
                <td className="table__number">{lot.quantity.toLocaleString('es-CR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination {...pages} itemLabel="lotes" onPage={pages.setPage} />
    </Modal>
  );
}
