import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { formatMoney } from '../products/money';
import { PAYMENT_LABELS } from './payment-labels';
import { formatSaleDateTime, saleStatusLabel } from './sale-format';
import { useReceipt } from './use-receipt';

export function SaleDetailModal({
  saleId,
  onClose,
  onOpenReceipt,
}: {
  saleId: string;
  onClose: () => void;
  onOpenReceipt: (id: string) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const state = useReceipt(saleId, attempt);
  const sale = state.phase === 'ready' ? state.sale : null;

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
                {sale.items.map((item) => (
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
              {sale.adjustments.map((adjustment) => (
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
          </div>
        </>
      )}
    </Modal>
  );
}
