/**
 * Historial de abonos de un cliente (HU-19), dentro de su cuenta: una lista dentro
 * de una ventana, de 4 en 4 y armada en el servidor (docs/PANTALLAS.md, regla 2).
 */
import { useState } from 'react';
import { Pagination } from '../../components/Pagination';
import { MODAL_PAGE_SIZE } from '../../components/use-pagination';
import { creditService } from '../../services/credit.service';
import type { Payment } from '../../types/credit';
import { useKeyedRequest } from '../kardex/use-keyed-request';
import { formatMoney } from '../products/money';
import { formatPaymentDay } from './credit-format';

interface PaymentHistoryProps {
  customerId: string;
}

/** A qué se aplicó un abono: sus fiados, o «sin fiado» si es anterior a HU-19. */
function appliedTo(payment: Payment): string {
  if (payment.allocations.length === 0) {
    return 'Sin fiado asignado (abono anterior)';
  }

  return payment.allocations
    .map((allocation) => `Fiado #${allocation.saleNumber} (${formatMoney(allocation.amount)})`)
    .join(' · ');
}

/**
 * Los abonos del cliente, del más reciente al más antiguo. Pide al servidor solo la
 * página que se ve; mientras llega otra se sigue viendo la anterior con los botones
 * en espera (la ventana no salta). Un abono repartido entre varios fiados es UNA fila.
 *
 * @param props.customerId El cliente; el componente se monta de nuevo si cambia.
 */
export function PaymentHistory({ customerId }: PaymentHistoryProps) {
  const [position, setPosition] = useState({ page: 1, attempt: 0 });
  const history = useKeyedRequest(
    `${customerId}:${position.page}:${position.attempt}`,
    () => creditService.listPayments(customerId, position.page, MODAL_PAGE_SIZE),
    'No se pudo cargar el historial de abonos.',
  );
  const loaded = history.phase === 'ready' ? history.value : null;
  const shown = loaded ?? (history.phase === 'loading' ? (history.previous?.value ?? null) : null);

  return (
    <section aria-label="Historial de abonos" aria-busy={history.phase === 'loading'}>
      <h3>Historial de abonos</h3>
      {history.phase === 'failed' ? (
        <div className="alert alert--error" role="alert">
          <span>{history.message}</span>
          <button
            type="button"
            className="button"
            onClick={() => setPosition((current) => ({ ...current, attempt: current.attempt + 1 }))}
          >
            Reintentar
          </button>
        </div>
      ) : shown === null ? (
        <p className="muted" role="status">
          Cargando el historial…
        </p>
      ) : shown.total === 0 ? (
        <p className="muted">Este cliente todavía no tiene abonos registrados.</p>
      ) : (
        <>
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
                {shown.items.map((payment) => (
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
          <Pagination
            page={shown.page}
            pageCount={Math.max(1, Math.ceil(shown.total / shown.pageSize))}
            total={shown.total}
            from={(shown.page - 1) * shown.pageSize + 1}
            to={Math.min(shown.page * shown.pageSize, shown.total)}
            itemLabel="abonos"
            label="Páginas del historial de abonos"
            busy={history.phase === 'loading'}
            onPage={(page) => setPosition((current) => ({ ...current, page }))}
          />
        </>
      )}
    </section>
  );
}
