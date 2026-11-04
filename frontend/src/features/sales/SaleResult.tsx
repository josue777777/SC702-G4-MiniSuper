import type { Sale } from '../../types/sales';
import { formatDateTime } from '../inventory/inventory-count';
import { formatMoney } from '../products/money';
import { PAYMENT_LABELS } from './payment-labels';

interface SaleResultProps {
  sale: Sale;
  onNewSale: () => void;
  onOpenReceipt: (saleId: string) => void;
}

/**
 * Resumen de la venta recién confirmada (HU-16, HU-17, HU-18). El comprobante
 * imprimible (HU-34) se abre sobre esta misma venta ya guardada.
 *
 * Es una franja compacta sobre la caja: lo que el cajero necesita confirmar
 * (total, método, cambio, cliente) en una línea, y los productos a pedido
 * (también están en el comprobante). Así la caja queda lista para la próxima
 * venta sin desplazarse.
 */
export function SaleResult({ sale, onNewSale, onOpenReceipt }: SaleResultProps) {
  return (
    <section className="pos__result" aria-label="Venta confirmada">
      <p className="pos__result-title" role="status">
        <span className="pos__result-check" aria-hidden="true">
          ✓
        </span>
        Venta #{sale.number} confirmada · {formatDateTime(sale.createdAt)}
      </p>

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
          <div className="pos__summary-change">
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

      <details className="disclosure pos__result-lines">
        <summary>Productos ({sale.items.length})</summary>
        <ul className="pos__lines">
          {sale.items.map((line) => (
            <li key={line.productId}>
              {line.quantity} × {line.name} — {formatMoney(line.subtotal)}
            </li>
          ))}
        </ul>
      </details>

      <div className="pos__result-actions">
        <button type="button" className="button" onClick={() => onOpenReceipt(sale.id)}>
          Ver comprobante
        </button>
        <button type="button" className="button button--primary" onClick={onNewSale}>
          Nueva venta
        </button>
      </div>
    </section>
  );
}
