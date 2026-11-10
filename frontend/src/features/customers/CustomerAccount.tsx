import { useState } from 'react';
import type { Fiado, Payment, PaymentResult } from '../../types/credit';
import { formatMoney } from '../products/money';
import { formatFiadoDate, formatPaymentDay } from './credit-format';
import { PaymentModal } from './PaymentModal';
import { useCustomerAccount } from './use-customer-account';

const STATUS_LABELS: Record<Fiado['status'], { label: string; badge: string }> = {
  PENDING: { label: 'Pendiente', badge: 'badge--warning' },
  PARTIAL: { label: 'Pago parcial', badge: 'badge--warning' },
  SETTLED: { label: 'Saldado', badge: 'badge--ok' },
};

interface CustomerAccountProps {
  customerId: string;
  /** Cambió la deuda del cliente: la lista de clientes se actualiza. */
  onChanged: () => void;
}

/** Texto de a qué se aplicó un abono: sus fiados, o «sin fiado» si es anterior a HU-19. */
function appliedTo(payment: Payment): string {
  if (payment.allocations.length === 0) {
    return 'Sin fiado asignado (abono anterior)';
  }

  return payment.allocations
    .map((allocation) => `Fiado #${allocation.saleNumber} (${formatMoney(allocation.amount)})`)
    .join(' · ');
}

/**
 * Ficha del cliente (HU-19): su deuda actual, sus fiados con lo abonado y lo
 * pendiente de cada uno, el historial de abonos y la acción «Registrar abono».
 * Todo viene del servidor: tras guardar un abono se vuelve a pedir, así que la
 * ficha nunca muestra un saldo viejo y no hace falta recargar la página.
 */
export function CustomerAccount({ customerId, onChanged }: CustomerAccountProps) {
  const { credit, payments, error, loading, refreshing, reload } = useCustomerAccount(customerId);
  const [paying, setPaying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function handlePaid(result: PaymentResult): void {
    const paid = formatMoney(result.payment.amount);

    setPaying(false);
    setNotice(
      result.replayed
        ? `Este abono de ${paid} ya estaba registrado; no se cobró de nuevo.`
        : result.credit.settled
          ? `Abono de ${paid} registrado correctamente. El cliente ya no tiene fiados pendientes. Cuenta saldada.`
          : `Abono de ${paid} registrado correctamente. Saldo pendiente: ${formatMoney(result.credit.balance)}.`,
    );
    reload();
    onChanged();
  }

  if (error !== null) {
    return (
      <section className="card">
        <div className="alert alert--error" role="alert">
          <span>{error}</span>
          <button type="button" className="button" onClick={reload}>
            Reintentar
          </button>
        </div>
      </section>
    );
  }

  if (loading || credit === null) {
    return (
      <section className="card">
        <p className="muted" role="status">
          Cargando la cuenta del cliente…
        </p>
      </section>
    );
  }

  const owing = credit.fiados.filter((fiado) => fiado.status !== 'SETTLED');
  const hasDebt = Number(credit.balance) > 0;

  return (
    <section
      className="card"
      aria-label={`Cuenta de ${credit.customer.name}`}
      aria-busy={refreshing}
    >
      <header className="card__header">
        <h2>
          {credit.customer.name}{' '}
          {credit.settled ? (
            <span className="badge badge--ok">Saldado</span>
          ) : hasDebt ? (
            <span className="badge badge--warning">Con deuda</span>
          ) : null}
        </h2>
        <span className="card__header-end">
          <button
            type="button"
            className="button button--primary"
            disabled={!hasDebt}
            onClick={() => {
              setNotice(null);
              setPaying(true);
            }}
          >
            Registrar abono
          </button>
        </span>
      </header>

      <p className="muted">Teléfono: {credit.customer.phone ?? '—'}</p>

      {notice === null ? null : (
        <div className="alert alert--success" role="status">
          <span>{notice}</span>
          <button
            type="button"
            className="alert__close"
            aria-label="Cerrar aviso"
            onClick={() => setNotice(null)}
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
          <strong className="stat-tile__value">{owing.length}</strong>
        </div>
      </div>

      {credit.fiados.length === 0 ? null : (
        <>
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
                {credit.fiados.map((fiado) => (
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
        </>
      )}

      {Number(credit.unassignedPaid) > 0 ? (
        <p className="muted">
          Incluye {formatMoney(credit.unassignedPaid)} de abonos anteriores que no están asignados a
          ningún fiado: bajan la deuda del cliente, pero no se atribuyen a una venta.
        </p>
      ) : null}

      <h3>Historial de abonos</h3>
      {payments.length === 0 ? (
        <p className="muted">Este cliente todavía no tiene abonos registrados.</p>
      ) : (
        <div className="table-wrapper">
          <table className="table table--compact" aria-label="Historial de abonos">
            <thead>
              <tr>
                <th>Fecha del pago</th>
                <th className="table__number">Monto</th>
                <th>Aplicado a</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{formatPaymentDay(payment.paymentDate)}</td>
                  <td className="table__number">{formatMoney(payment.amount)}</td>
                  <td>{appliedTo(payment)}</td>
                  <td>{payment.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paying ? (
        <PaymentModal
          credit={credit}
          onClose={() => setPaying(false)}
          onPaid={handlePaid}
          onStale={reload}
        />
      ) : null}
    </section>
  );
}
