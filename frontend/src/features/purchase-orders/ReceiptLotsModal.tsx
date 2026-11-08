import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { MODAL_PAGE_SIZE, usePagination } from '../../components/use-pagination';
import type { PurchaseOrderItem } from '../../types/purchase-orders';
import { emptyLot, lotsError, lotsTotal, type LotDraft } from './receipt-lots';

interface ReceiptLotsModalProps {
  item: PurchaseOrderItem;
  /** Lotes que ya tenía la fila (se editan en una copia). */
  lots: LotDraft[];
  /** Día en que llegó: un lote no puede llegar vencido. */
  receivedOn: string;
  /** Guarda los lotes en la fila y cierra. */
  onDone: (lots: LotDraft[]) => void;
  onClose: () => void;
}

/**
 * «Partir en lotes» (HU-38): cuando lo que llegó de UN producto viene en varios
 * lotes, cada uno con su número, su fecha de vencimiento y sus unidades. Se
 * abre desde la fila del producto en «Registrar entrega» y solo muestra ese
 * producto (regla 4): lo demás de la entrega sigue en la ventana de atrás.
 *
 * Se trabaja sobre una copia: «Cancelar» deja la fila como estaba. Los lotes
 * van de 4 en 4 (regla 2) y la suma se ve siempre, para que cuadre con lo que
 * llegó.
 */
export function ReceiptLotsModal({
  item,
  lots,
  receivedOn,
  onDone,
  onClose,
}: ReceiptLotsModalProps) {
  const [drafts, setDrafts] = useState<LotDraft[]>(() =>
    lots.length === 0 ? [emptyLot(item.pendingQuantity)] : lots.map((lot) => ({ ...lot })),
  );
  const [error, setError] = useState<string | null>(null);
  const indexed = drafts.map((lot, index) => ({ lot, index }));
  const pages = usePagination(indexed, item.productId, MODAL_PAGE_SIZE);
  const total = lotsTotal(drafts);

  function change(index: number, field: keyof LotDraft, value: string): void {
    setDrafts((current) =>
      current.map((lot, position) => (position === index ? { ...lot, [field]: value } : lot)),
    );
  }

  /** El lote nuevo va arriba, con lo que falta para cuadrar: siempre queda a la vista. */
  function add(): void {
    setDrafts((current) => [emptyLot(Math.max(0, item.pendingQuantity - total)), ...current]);
    pages.setPage(1);
  }

  function remove(index: number): void {
    setDrafts((current) => current.filter((_, position) => position !== index));
  }

  function done(): void {
    const found = lotsError(item, drafts, receivedOn);

    setError(found);

    if (found === null) {
      onDone(drafts);
    }
  }

  return (
    <Modal title={`Lotes · ${item.productName}`} onClose={onClose}>
      <div className="table-wrapper">
        <table className="table" aria-label={`Lotes de ${item.productName}`}>
          <thead>
            <tr>
              <th>Lote</th>
              <th>Vence</th>
              <th className="table__number">Unidades</th>
              <th>
                <span className="visually-hidden">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pages.pageItems.map(({ lot, index }) => (
              <tr key={index}>
                <td>
                  <input
                    aria-label={`Lote ${index + 1}`}
                    value={lot.lotNumber}
                    maxLength={40}
                    autoComplete="off"
                    placeholder={item.perishable ? '' : 'N.º de factura'}
                    data-autofocus={index === 0 ? true : undefined}
                    onChange={(event) => change(index, 'lotNumber', event.target.value)}
                  />
                </td>
                <td>
                  {item.perishable ? (
                    <input
                      type="date"
                      aria-label={`Vence el lote ${index + 1}`}
                      min={receivedOn}
                      value={lot.expirationDate}
                      onChange={(event) => change(index, 'expirationDate', event.target.value)}
                    />
                  ) : (
                    <span className="muted">No vence</span>
                  )}
                </td>
                <td className="table__number">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    aria-label={`Unidades del lote ${index + 1}`}
                    value={lot.quantity}
                    onChange={(event) => change(index, 'quantity', event.target.value)}
                  />
                </td>
                <td>
                  {drafts.length > 1 ? (
                    <button type="button" className="button" onClick={() => remove(index)}>
                      Quitar
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination {...pages} itemLabel="lotes" onPage={pages.setPage} />

      <p className="muted hint" role="status">
        Suman {total} de {item.pendingQuantity} que faltan.
      </p>

      {error === null ? null : (
        <p className="form__error" role="alert">
          {error}
        </p>
      )}

      <div className="form__actions">
        <button type="button" className="button button--primary" onClick={done}>
          Listo
        </button>
        <button type="button" className="button" onClick={add}>
          + Agregar lote
        </button>
        <button type="button" className="button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}
