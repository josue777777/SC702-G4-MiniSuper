import type { Sale } from '../../types/sales';
import { formatDateTime } from '../inventory/inventory-count';
import { formatMoney } from '../products/money';
import { PAYMENT_LABELS } from './payment-labels';

/** Nombre del negocio que encabeza el comprobante. */
export const BUSINESS_NAME = 'Abastecedor Nuevo Amanecer';

interface SaleReceiptProps {
  sale: Sale;
}

/**
 * Ticket de caja de una venta (HU-34), pensado para papel angosto (80 mm).
 *
 * Solo dibuja lo que recibe: la venta ya guardada, con los precios históricos de
 * cada línea. Nunca consulta ni recalcula precios del catálogo. Muestra el
 * nombre del cliente solo en fiados y no incluye datos sensibles (ni teléfono ni
 * saldo).
 */
export function SaleReceipt({ sale }: SaleReceiptProps) {
  return (
    <article className="receipt" aria-label={`Comprobante de la venta ${sale.number}`}>
      <header className="receipt__header">
        <strong className="receipt__business">{BUSINESS_NAME}</strong>
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
            <tr key={line.productId}>
              <td>{line.name}</td>
              <td className="receipt__num">{line.quantity}</td>
              <td className="receipt__num">{formatMoney(line.unitPrice)}</td>
              <td className="receipt__num">{formatMoney(line.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="receipt__totals">
        <div className="receipt__total">
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
        {sale.paymentMethod === 'CREDIT' && sale.customer !== null ? (
          <div>
            <dt>Cliente (fiado)</dt>
            <dd>{sale.customer.name}</dd>
          </div>
        ) : null}
      </dl>

      <footer className="receipt__footer">¡Gracias por su compra!</footer>
    </article>
  );
}
