import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { MODAL_PAGE_SIZE, usePagination } from '../../components/use-pagination';
import type { KardexMovement } from '../../types/kardex';
import { formatLotDate, formatMovementDate } from './kardex-format';

/**
 * Lotes con que entró UNA línea del Kardex (HU-38): número de lote, fecha de
 * vencimiento y unidades. Se abre desde el botón de la línea; la tabla del
 * historial no se parte en una fila por lote. De 4 en 4 (regla 2).
 */
export function MovementLotsModal({
  movement,
  onClose,
}: {
  movement: KardexMovement;
  onClose: () => void;
}) {
  const pages = usePagination(movement.lots, movement.id, MODAL_PAGE_SIZE);

  return (
    <Modal title={`Lotes · ${movement.concept}`} onClose={onClose}>
      <p className="muted">
        {formatMovementDate(movement.createdAt)}
        {movement.document === null ? '' : ` · Documento ${movement.document}`}
      </p>
      <div className="table-wrapper">
        <table className="table" aria-label="Lotes del movimiento">
          <thead>
            <tr>
              <th>Lote</th>
              <th>Vence</th>
              <th className="table__number">Unidades</th>
            </tr>
          </thead>
          <tbody>
            {pages.pageItems.map((lot) => (
              <tr key={`${lot.lotNumber}-${lot.expirationDate ?? ''}`}>
                <td>{lot.lotNumber}</td>
                <td>{formatLotDate(lot.expirationDate)}</td>
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
