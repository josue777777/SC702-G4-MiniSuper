import type { Sale } from '../../types/sales';
import { formatDateTime } from '../inventory/inventory-count';
import { formatMoney } from '../products/money';
import { PAYMENT_LABELS } from './payment-labels';

interface SaleResultProps {
  sale: Sale;
  onNewSale: () => void;
}

/**
 * Resumen de la venta recién confirmada (HU-16, HU-17, HU-18). El comprobante
 * imprimible es HU-34: se montará aquí, sobre esta misma venta persistida.
 */
export function SaleResult({ sale, onNewSale }: SaleResultProps) {
  return (
    <section className="card pos__result" aria-label="Venta confirmada">
      <div className="alert alert--success" role="status">
        Venta #{sale.number} confirmada · {formatDateTime(sale.createdAt)}
      </div>

      <dl className="pos__summary">
        <div>
          <dt>Total</dt>
          <dd>{formatMoney(sale.total)}</dd>
        </div>
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
        {sale.customer === null ? null : (
          <div>
            <dt>Cliente</dt>
            <dd>{sale.customer.name}</dd>
          </div>
        )}
        {sale.customerBalance === null ? null : (
          <div>
            <dt>Deuda acumulada</dt>
            <dd data-testid="customer-balance">{formatMoney(sale.customerBalance)}</dd>
          </div>
        )}
      </dl>

      <ul className="pos__lines">
        {sale.items.map((line) => (
          <li key={line.productId}>
            {line.quantity} × {line.name} — {formatMoney(line.subtotal)}
          </li>
        ))}
      </ul>

      <button type="button" className="button button--primary" onClick={onNewSale}>
        Nueva venta
      </button>
    </section>
  );
}
