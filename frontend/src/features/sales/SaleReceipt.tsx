import type { Sale } from '../../types/sales';
import { useBusiness } from '../business/business-context';
import { formatDateTime } from '../inventory/inventory-count';
import { formatMoney } from '../products/money';
import { PAYMENT_LABELS } from './payment-labels';

interface SaleReceiptProps {
  sale: Sale;
}

/**
 * Ticket de caja de una venta (HU-34), pensado para papel angosto (80 mm).
 *
 * Solo dibuja lo que recibe: la venta ya guardada, con los precios históricos de
 * cada línea y sus ajustes auditados. Nunca consulta el catálogo. El encabezado
 * y el mensaje del pie salen de Configuración › General.
 */
export function SaleReceipt({ sale }: SaleReceiptProps) {
  const { business } = useBusiness();

  return (
    <article className="receipt" aria-label={`Comprobante de la venta ${sale.number}`}>
      <header className="receipt__header">
        <strong className="receipt__business">{business.name}</strong>
        {business.legalId === null ? null : <span>Céd. {business.legalId}</span>}
        {business.address === null ? null : <span>{business.address}</span>}
        {business.phone === null ? null : <span>Tel. {business.phone}</span>}
        <span>Comprobante de venta</span>
        <span>Venta #{sale.number}</span>
        <span>{formatDateTime(sale.createdAt)}</span>
      </header>

      <table className="receipt__lines">
        <thead>
          <tr>
            <th scope="col">Producto</th>
            <th scope="col" className="receipt__num">
              Cant.
            </th>
            <th scope="col" className="receipt__num">
              Precio
            </th>
            <th scope="col" className="receipt__num">
              Subtotal
            </th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((line) => (
            <tr key={line.id}>
              <td>{line.name}</td>
              <td className="receipt__num">
                {line.quantity}
                {line.returnedQuantity > 0 ? ` (${line.returnedQuantity} dev.)` : ''}
              </td>
              <td className="receipt__num">{formatMoney(line.unitPrice)}</td>
              <td className="receipt__num">{formatMoney(line.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="receipt__totals">
        {sale.adjustments.length === 0 ? null : (
          <div className="receipt__total">
            <dt>Total original</dt>
            <dd>{formatMoney(sale.originalTotal)}</dd>
          </div>
        )}
        {sale.adjustments.map((adjustment) => (
          <div key={adjustment.id}>
            <dt>{adjustment.type === 'VOID' ? 'Anulación' : 'Devolución'}</dt>
            <dd>−{formatMoney(adjustment.total)}</dd>
          </div>
        ))}
        <div className="receipt__total">
          <dt>{sale.status === 'COMPLETED' ? 'Total' : 'Total actualizado'}</dt>
          <dd>{formatMoney(sale.total)}</dd>
        </div>
        {sale.status === 'COMPLETED' ? null : (
          <div>
            <dt>Estado</dt>
            <dd>{saleStatusLabel(sale.status)}</dd>
          </div>
        )}
        <div>
          <dt>Método de pago</dt>
          <dd>{PAYMENT_LABELS[sale.paymentMethod]}</dd>
        </div>
        {sale.cashReceived === null ? null : (
          <div>
            <dt>Efectivo recibido</dt>
            <dd>{formatMoney(sale.cashReceived)}</dd>
          </div>
        )}
        {sale.change === null ? null : (
          <div>
            <dt>Cambio</dt>
            <dd>{formatMoney(sale.change)}</dd>
          </div>
        )}
        {sale.paymentMethod === 'CREDIT' && sale.customer !== null ? (
          <div>
            <dt>Cliente (fiado)</dt>
            <dd>{sale.customer.name}</dd>
          </div>
        ) : null}
      </dl>

      {sale.adjustments.length === 0 ? null : (
        <section
          className="receipt__adjustments"
          aria-label="Auditoría de devoluciones y anulaciones"
        >
          {sale.adjustments.map((adjustment) => (
            <p key={adjustment.id}>
              {adjustment.type === 'VOID' ? 'Anulación' : 'Devolución'} ·{' '}
              {formatDateTime(adjustment.createdAt)} · {adjustment.reason}
            </p>
          ))}
        </section>
      )}

      {business.receiptMessage === null ? null : (
        <footer className="receipt__footer">{business.receiptMessage}</footer>
      )}
    </article>
  );
}

function saleStatusLabel(status: Sale['status']): string {
  switch (status) {
    case 'COMPLETED':
      return 'Completada';
    case 'PARTIALLY_RETURNED':
      return 'Con devolución parcial';
    case 'RETURNED':
      return 'Devuelta por completo';
    case 'VOID':
      return 'Anulada';
  }
}
