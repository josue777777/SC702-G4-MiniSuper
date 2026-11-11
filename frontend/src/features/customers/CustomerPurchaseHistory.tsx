/** Historial y detalle de compras asociados a la cuenta del cliente (HU-36). */
import { useEffect, useState } from 'react';
import { Pagination } from '../../components/Pagination';
import { MODAL_PAGE_SIZE, usePagination } from '../../components/use-pagination';
import { ApiError } from '../../services/api-client';
import { customerHistoryService } from '../../services/customer-history.service';
import type {
  CustomerPurchase,
  CustomerPurchaseHistory as PurchaseHistory,
} from '../../types/sales';
import { formatMoney } from '../products/money';
import { formatSaleDateTime, saleStatusLabel } from '../sales/sale-format';
import { PAYMENT_LABELS } from '../sales/payment-labels';

const CREDIT_LABELS: Record<NonNullable<CustomerPurchase['credit']>['status'], string> = {
  PENDING: 'Pendiente',
  PARTIAL: 'Pago parcial',
  SETTLED: 'Liquidado',
};

interface LoadedHistory {
  customerId: string;
  history: PurchaseHistory;
}

/**
 * Historial del cliente (HU-36): contado y crédito en una sola secuencia reciente,
 * con estados derivados del servidor y detalle paginado de cada compra.
 */
export function CustomerPurchaseHistory({ customerId }: { customerId: string }) {
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState<LoadedHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CustomerPurchase | null>(null);
  const [attempt, setAttempt] = useState(0);
  const requestedKey = `${customerId}:${page}:${attempt}`;

  useEffect(() => {
    let cancelled = false;

    customerHistoryService
      .purchases(customerId, page, MODAL_PAGE_SIZE)
      .then((history) => {
        if (!cancelled) {
          setLoaded({ customerId, history });
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof ApiError
              ? caught.message
              : 'No se pudo cargar el historial de compras.',
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [customerId, page, attempt]);

  const current = loaded?.customerId === customerId ? loaded.history : null;
  const busy =
    current !== null &&
    `${customerId}:${current.page}:${attempt}` !== requestedKey &&
    error === null;

  if (current === null && error !== null) {
    return (
      <section aria-label="Historial de compras">
        <h3>Historial de compras</h3>
        <div className="alert alert--error" role="alert">
          <span>{error}</span>
          <button type="button" className="button" onClick={() => setAttempt((value) => value + 1)}>
            Reintentar
          </button>
        </div>
      </section>
    );
  }

  if (current === null) {
    return (
      <section aria-label="Historial de compras">
        <h3>Historial de compras</h3>
        <p className="muted" role="status">
          Cargando historial de compras…
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Historial de compras" aria-busy={busy}>
      <h3>Historial de compras</h3>
      <p className="muted">
        Solo se muestran compras asociadas a este cliente; en Caja se puede asociar opcionalmente
        cada compra al contado.
      </p>
      {error === null ? null : (
        <div className="alert alert--error" role="alert">
          <span>{error}</span>
          <button type="button" className="button" onClick={() => setAttempt((value) => value + 1)}>
            Reintentar
          </button>
        </div>
      )}
      {selected !== null ? (
        <CustomerPurchaseDetail sale={selected} onBack={() => setSelected(null)} />
      ) : current.total === 0 ? (
        <p className="muted">No hay historial de compras disponible para este cliente.</p>
      ) : (
        <>
          <div className="table-wrapper">
            <table className="table table--compact" aria-label="Compras del cliente">
              <thead>
                <tr>
                  <th>Compra</th>
                  <th>Fecha</th>
                  <th>Productos</th>
                  <th>Tipo</th>
                  <th className="table__number">Total</th>
                  <th className="table__number">Abonado</th>
                  <th className="table__number">Pendiente</th>
                  <th>Estado</th>
                  <th>
                    <span className="visually-hidden">Detalle</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {current.sales.map((sale) => (
                  <tr key={sale.id}>
                    <td>#{sale.number}</td>
                    <td>{formatSaleDateTime(sale.createdAt)}</td>
                    <td>
                      {sale.items.length === 0
                        ? '—'
                        : `${sale.items[0]!.name}${sale.items.length > 1 ? ` +${sale.items.length - 1} más` : ''}`}
                    </td>
                    <td>
                      <span
                        className={`badge ${sale.paymentMethod === 'CREDIT' ? 'badge--warning' : 'badge--ok'}`}
                      >
                        {sale.paymentMethod === 'CREDIT' ? 'Fiado' : 'Contado'}
                      </span>
                      {sale.paymentMethod === 'CREDIT' ? null : (
                        <small className="muted"> · {PAYMENT_LABELS[sale.paymentMethod]}</small>
                      )}
                    </td>
                    <td className="table__number">{formatMoney(sale.total)}</td>
                    <td className="table__number">
                      {sale.credit === null ? '—' : formatMoney(sale.credit.paidAmount)}
                    </td>
                    <td className="table__number">
                      {sale.credit === null ? '—' : formatMoney(sale.credit.pendingAmount)}
                    </td>
                    <td>
                      {sale.paymentMethod !== 'CREDIT' ? (
                        saleStatusLabel(sale.status)
                      ) : sale.credit === null ? (
                        saleStatusLabel(sale.status)
                      ) : (
                        <span
                          className={`badge ${sale.credit.status === 'SETTLED' ? 'badge--ok' : 'badge--warning'}`}
                        >
                          {CREDIT_LABELS[sale.credit.status]}
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button"
                        aria-label={`Ver detalle de la compra ${sale.number}`}
                        onClick={() => setSelected(sale)}
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={current.page}
            pageCount={current.pageCount}
            total={current.total}
            from={(current.page - 1) * current.pageSize + 1}
            to={Math.min(current.page * current.pageSize, current.total)}
            itemLabel="compras"
            onPage={setPage}
            busy={busy}
          />
        </>
      )}
    </section>
  );
}

function CustomerPurchaseDetail({ sale, onBack }: { sale: CustomerPurchase; onBack: () => void }) {
  const items = usePagination(sale.items, sale.id, MODAL_PAGE_SIZE);

  return (
    <div>
      <div className="toolbar">
        <h4>Detalle de compra #{sale.number}</h4>
        <button type="button" className="button" onClick={onBack}>
          Volver al historial de compras
        </button>
      </div>
      <p>
        {formatSaleDateTime(sale.createdAt)} · {PAYMENT_LABELS[sale.paymentMethod]} ·{' '}
        {sale.paymentMethod === 'CREDIT'
          ? sale.credit === null
            ? saleStatusLabel(sale.status)
            : CREDIT_LABELS[sale.credit.status]
          : saleStatusLabel(sale.status)}
      </p>
      <div className="table-wrapper">
        <table className="table" aria-label="Productos de la compra">
          <thead>
            <tr>
              <th>Código</th>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Devuelta</th>
              <th className="table__number">Precio unitario</th>
              <th className="table__number">Subtotal original</th>
            </tr>
          </thead>
          <tbody>
            {items.pageItems.map((item) => (
              <tr key={item.id}>
                <td>{item.code}</td>
                <td>{item.name}</td>
                <td>{item.quantity}</td>
                <td>{item.returnedQuantity}</td>
                <td className="table__number">{formatMoney(item.unitPrice)}</td>
                <td className="table__number">{formatMoney(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination {...items} itemLabel="productos" onPage={items.setPage} />
      <p>
        Total original: <strong>{formatMoney(sale.originalTotal)}</strong> · Total vigente:{' '}
        <strong>{formatMoney(sale.total)}</strong>
      </p>
      {sale.credit === null ? null : (
        <p>
          Abonado: <strong>{formatMoney(sale.credit.paidAmount)}</strong> · Pendiente:{' '}
          <strong>{formatMoney(sale.credit.pendingAmount)}</strong>
        </p>
      )}
      {sale.adjustments.length === 0 ? null : (
        <>
          <h3>Devoluciones y anulaciones</h3>
          <ul>
            {sale.adjustments.map((adjustment) => (
              <li key={adjustment.id}>
                {adjustment.type === 'VOID' ? 'Anulación' : 'Devolución'} de{' '}
                {formatMoney(adjustment.total)}: {adjustment.reason}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
