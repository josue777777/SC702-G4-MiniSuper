import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { MODAL_PAGE_SIZE, usePagination } from '../../components/use-pagination';
import { formatMoney } from '../products/money';
import { PAYMENT_LABELS } from './payment-labels';
import { formatSaleDateTime, saleStatusLabel } from './sale-format';
import { useReceipt } from './use-receipt';

/**
 * Detalle de una venta del historial (HU-20). Sus productos y sus ajustes van de
 * 4 en 4 (`MODAL_PAGE_SIZE`): una venta grande no estira la ventana.
 *
 * Desde aquí se abre el comprobante (HU-34) y, si la venta todavía se puede
 * corregir, «Anular o devolver» (HU-35): se decide viendo la venta completa, no
 * desde un botón suelto en la fila.
 */
export function SaleDetailModal({
  saleId,
  onClose,
  onOpenReceipt,
  onAdjust,
}: {
  saleId: string;
  onClose: () => void;
  onOpenReceipt: (id: string) => void;
  /** Abre «Anular o devolver» de esta venta (HU-35). */
  onAdjust: (id: string) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const state = useReceipt(saleId, attempt);
  const sale = state.phase === 'ready' ? state.sale : null;
  const items = usePagination(sale?.items ?? [], saleId, MODAL_PAGE_SIZE);
  const adjustments = usePagination(sale?.adjustments ?? [], saleId, MODAL_PAGE_SIZE);

  return (
    <Modal
      title={`Detalle de venta${sale === null ? '' : ` #${sale.number}`}`}
      onClose={onClose}
      size="wide"
    >
      {state.phase === 'loading' ? <p role="status">Cargando venta…</p> : null}
      {state.phase === 'error' ? (
        <p role="alert">
          {state.message}{' '}
          <button className="button" onClick={() => setAttempt(attempt + 1)}>
            Reintentar
          </button>
        </p>
      ) : null}
      {sale === null ? null : (
        <>
          <p>
            {formatSaleDateTime(sale.createdAt)} (Costa Rica) · {PAYMENT_LABELS[sale.paymentMethod]}{' '}
            · {saleStatusLabel(sale.status)}
          </p>
          <p>Cliente: {sale.customer?.name ?? 'Sin cliente asociado'}</p>
          <div className="table-wrapper">
            <table className="table" aria-label="Detalle de productos vendidos">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Cantidad original</th>
                  <th>Devuelta / anulada</th>
                  <th>Precio unitario</th>
                  <th>Subtotal original</th>
                </tr>
              </thead>
              <tbody>
                {items.pageItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.code}</td>
                    <td>{item.name}</td>
                    <td>{item.quantity}</td>
                    <td>{item.returnedQuantity}</td>
                    <td>{formatMoney(item.unitPrice)}</td>
                    <td>{formatMoney(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...items} itemLabel="productos" onPage={items.setPage} />
          <p>
            Total original: <strong>{formatMoney(sale.originalTotal)}</strong> · Total efectivo:{' '}
            <strong>{formatMoney(sale.total)}</strong>
          </p>
          {sale.cashReceived === null ? null : (
            <p>
              Efectivo recibido: {formatMoney(sale.cashReceived)} · Vuelto original:{' '}
              {formatMoney(sale.change ?? '0.00')}
            </p>
          )}
          {sale.customerBalance === null ? null : (
            <p>Saldo actual del cliente: {formatMoney(sale.customerBalance)}</p>
          )}
          <h3>Devoluciones y anulaciones</h3>
          {sale.adjustments.length === 0 ? (
            <p>Sin ajustes.</p>
          ) : (
            <ol className="sale-adjustment-history">
              {adjustments.pageItems.map((adjustment) => (
                <li key={adjustment.id}>
                  <strong>
                    {adjustment.type === 'VOID' ? 'Anulación' : 'Devolución'} ·{' '}
                    {formatMoney(adjustment.total)}
                  </strong>
                  <p>
                    {adjustment.reason} · {formatSaleDateTime(adjustment.createdAt)}
                  </p>
                  <p>
                    {adjustment.items
                      .map((item) => `${item.productName} × ${item.quantity}`)
                      .join(', ')}
                  </p>
                </li>
              ))}
            </ol>
          )}
          <Pagination
            {...adjustments}
            itemLabel="ajustes"
            label="Páginas de ajustes"
            onPage={adjustments.setPage}
          />
          <div className="form__actions">
            <button
              type="button"
              className="button"
              onClick={() => {
                onClose();
                onOpenReceipt(sale.id);
              }}
            >
              Abrir comprobante
            </button>
            {sale.status === 'COMPLETED' || sale.status === 'PARTIALLY_RETURNED' ? (
              <button
                type="button"
                className="button"
                aria-label={`Anular o devolver la venta ${sale.number}`}
                onClick={() => onAdjust(sale.id)}
              >
                Anular o devolver
              </button>
            ) : null}
          </div>
        </>
      )}
    </Modal>
  );
}
