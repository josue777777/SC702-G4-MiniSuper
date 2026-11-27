/**
 * Cuenta de un cliente (HU-19, HU-36), en una ventana: su deuda, sus fiados con
 * lo abonado y pendiente, el historial de abonos y sus compras. Se abre desde
 * «Ver cuenta» en Clientes y trabaja solo con ESE cliente (docs/PANTALLAS.md,
 * regla 12); registrar un abono es otra tarea, así que «Registrar abono» cierra
 * esta ventana y abre el formulario (como «Anular o devolver» en una venta).
 */
import { useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { MODAL_PAGE_SIZE, usePagination } from '../../components/use-pagination';
import type { Fiado } from '../../types/credit';
import type { Customer } from '../../types/sales';
import { formatMoney } from '../products/money';
import { formatFiadoDate } from './credit-format';
import { PaymentHistory } from './PaymentHistory';
import { CustomerPurchaseHistory } from './CustomerPurchaseHistory';
import { useCustomerCredit } from './use-customer-credit';

const STATUS_LABELS: Record<Fiado['status'], { label: string; badge: string }> = {
  PENDING: { label: 'Pendiente', badge: 'badge--warning' },
  PARTIAL: { label: 'Pago parcial', badge: 'badge--warning' },
  SETTLED: { label: 'Saldado', badge: 'badge--ok' },
};

interface CustomerAccountModalProps {
  customer: Customer;
  /** Aviso de un abono recién registrado (con el saldo que quedó). */
  notice: string | null;
  onDismissNotice: () => void;
  /** «Registrar abono»: esta ventana se cierra y se abre el formulario. */
  onPay: () => void;
  onClose: () => void;
}

/**
 * Los fiados se ven con los que todavía se deben primero (es lo que se viene a
 * cobrar) y, dentro de cada grupo, del más antiguo al más reciente: el orden en
 * que el sistema reparte un abono.
 */
function pendingFirst(fiados: readonly Fiado[]): Fiado[] {
  return [...fiados].sort(
    (a, b) =>
      Number(a.status === 'SETTLED') - Number(b.status === 'SETTLED') || a.number - b.number,
  );
}

/**
 * Ventana con la cuenta, fiados, abonos e historial de compras del cliente
 * (HU-19 y HU-36). Todo viene del servidor y se pide cada vez que se abre, así
 * que nunca muestra un saldo viejo ni hace falta recargar la página.
 *
 * @param props.customer El cliente elegido en la lista (su nombre titula la ventana).
 * @param props.notice Confirmación del último abono, si se acaba de registrar uno.
 * @param props.onPay Pide el formulario de abono.
 * @returns La ventana con la cuenta y el historial del cliente.
 */
export function CustomerAccountModal({
  customer,
  notice,
  onDismissNotice,
  onPay,
  onClose,
}: CustomerAccountModalProps) {
  const { credit, error, loading, refreshing, reload } = useCustomerCredit(customer.id);
  const fiados = useMemo(() => pendingFirst(credit?.fiados ?? []), [credit]);
  const pages = usePagination(fiados, customer.id, MODAL_PAGE_SIZE);
  const hasDebt = credit !== null && Number(credit.balance) > 0;
  const owing = fiados.filter((fiado) => fiado.status !== 'SETTLED').length;
  const [showPurchases, setShowPurchases] = useState(false);

  return (
    <Modal title={`Cuenta de ${customer.name}`} size="wide" onClose={onClose}>
      {error !== null ? (
        <div className="alert alert--error" role="alert">
          <span>{error}</span>
          <button type="button" className="button" onClick={reload}>
            Reintentar
          </button>
        </div>
      ) : loading || credit === null ? (
        <p className="muted" role="status">
          Cargando la cuenta del cliente…
        </p>
      ) : (
        <div aria-busy={refreshing}>
          <div className="toolbar">
            <p className="muted">
              Teléfono: {credit.customer.phone ?? '—'}{' '}
              {credit.settled ? (
                <span className="badge badge--ok">Saldado</span>
              ) : hasDebt ? (
                <span className="badge badge--warning">Con deuda</span>
              ) : null}
            </p>
            <button
              type="button"
              className="button button--primary"
              disabled={!hasDebt}
              onClick={onPay}
            >
              Registrar abono
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setShowPurchases(!showPurchases)}
            >
              {showPurchases ? 'Volver a la cuenta' : 'Ver historial de compras'}
            </button>
          </div>

          {showPurchases ? (
            <CustomerPurchaseHistory key={customer.id} customerId={customer.id} />
          ) : (
            <>
              {notice === null ? null : (
                <div className="alert alert--success" role="status">
                  <span>{notice}</span>
                  <button
                    type="button"
                    className="alert__close"
                    aria-label="Cerrar aviso"
                    onClick={onDismissNotice}
                  >
                    ×
                  </button>
                </div>
              )}

              {hasDebt ? null : (
                <p className="muted" role="status">
                  {credit.hasCredit
                    ? 'Este cliente no tiene fiados pendientes. Cuenta saldada.'
                    : 'Este cliente no tiene fiados pendientes.'}
                </p>
              )}

              <div className="stat-grid" aria-label="Resumen de la cuenta">
                <div className="stat-tile">
                  <span className="stat-tile__label">Deuda actual</span>
                  <strong className="stat-tile__value">{formatMoney(credit.balance)}</strong>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile__label">Total abonado</span>
                  <strong className="stat-tile__value">{formatMoney(credit.totalPaid)}</strong>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile__label">Fiados pendientes</span>
                  <strong className="stat-tile__value">{owing}</strong>
                </div>
              </div>

              {fiados.length === 0 ? null : (
                <section aria-label="Fiados">
                  <h3>Fiados</h3>
                  <div className="table-wrapper">
                    <table className="table table--compact" aria-label="Fiados del cliente">
                      <thead>
                        <tr>
                          <th>Fiado</th>
                          <th>Fecha</th>
                          <th className="table__number">Monto original</th>
                          <th className="table__number">Monto vigente</th>
                          <th className="table__number">Abonado</th>
                          <th className="table__number">Pendiente</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pages.pageItems.map((fiado) => (
                          <tr key={fiado.saleId}>
                            <td>#{fiado.number}</td>
                            <td>{formatFiadoDate(fiado.createdAt)}</td>
                            <td className="table__number">{formatMoney(fiado.originalAmount)}</td>
                            <td className="table__number">{formatMoney(fiado.effectiveAmount)}</td>
                            <td className="table__number">{formatMoney(fiado.paidAmount)}</td>
                            <td className="table__number">{formatMoney(fiado.pendingAmount)}</td>
                            <td>
                              <span className={`badge ${STATUS_LABELS[fiado.status].badge}`}>
                                {STATUS_LABELS[fiado.status].label}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination {...pages} itemLabel="fiados" onPage={pages.setPage} />
                </section>
              )}

              {Number(credit.unassignedPaid) > 0 ? (
                <p className="muted hint">
                  Incluye {formatMoney(credit.unassignedPaid)} de abonos anteriores que no están
                  asignados a ningún fiado: bajan la deuda del cliente, pero no se atribuyen a una
                  venta.
                </p>
              ) : null}

              <PaymentHistory key={customer.id} customerId={customer.id} />
            </>
          )}

          <div className="form__actions modal__actions">
            <button type="button" className="button" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
