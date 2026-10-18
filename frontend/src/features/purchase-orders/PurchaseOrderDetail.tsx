import type { PurchaseOrder } from '../../types/purchase-orders';
import { formatDateTime } from '../inventory/inventory-count';
import { formatMoney } from '../products/money';
import { formatOrderNumber, STATUS_LABELS } from './purchase-order-form';

interface PurchaseOrderDetailProps {
  order: PurchaseOrder;
  onClose: () => void;
}

/**
 * Imprime solo el pedido: marca el `body` y la hoja de estilos oculta el resto
 * (el mismo mecanismo del reporte de vencimientos de HU-09).
 */
function printOrder(): void {
  document.body.classList.add('printing-report');
  window.addEventListener('afterprint', () => document.body.classList.remove('printing-report'), {
    once: true,
  });
  window.print();
}

/**
 * Detalle completo de un pedido (HU-22) y documento del pedido (HU-24).
 *
 * El documento se imprime para entregarlo al proveedor: trae la cantidad
 * solicitada y una columna «Cant. recibida» en blanco, más espacio para nombre,
 * fecha y firma de quien recibe. Ese papel respalda la entrada de mercadería que
 * después se registra en el sistema.
 *
 * «Imprimir / Guardar PDF» abre el diálogo de impresión del navegador, que
 * permite imprimirlo o elegir «Guardar como PDF» para enviarlo al proveedor.
 * Así el PDF sale al instante y sin una librería extra.
 */
export function PurchaseOrderDetail({ order, onClose }: PurchaseOrderDetailProps) {
  const contact = [order.supplierPhone, order.supplierEmail].filter(Boolean).join(' · ');

  return (
    <section className="card print-area">
      <div className="print-only">
        <h1>Pedido a proveedor {formatOrderNumber(order.number)}</h1>
      </div>

      <header className="card__header">
        <h2>
          Pedido {formatOrderNumber(order.number)} · {order.supplierName}
        </h2>
        <div className="toolbar no-print">
          <button type="button" className="button button--primary" onClick={printOrder}>
            Imprimir / Guardar PDF
          </button>
          <button type="button" className="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </header>

      <dl className="order-meta">
        <div>
          <dt>Proveedor</dt>
          <dd>{order.supplierName}</dd>
        </div>
        {contact === '' ? null : (
          <div>
            <dt>Contacto</dt>
            <dd>{contact}</dd>
          </div>
        )}
        <div>
          <dt>Fecha</dt>
          <dd>{formatDateTime(order.createdAt)}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>{STATUS_LABELS[order.status]}</dd>
        </div>
        <div>
          <dt>N.º de pedido</dt>
          <dd>
            <strong>{formatOrderNumber(order.number)}</strong>
          </dd>
        </div>
        {order.notes === null ? null : (
          <div>
            <dt>Notas</dt>
            <dd>{order.notes}</dd>
          </div>
        )}
      </dl>

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Producto</th>
              <th className="table__number">Cant. solicitada</th>
              {/* En blanco: se llena a mano al recibir la mercadería. */}
              <th className="table__number">Cant. recibida</th>
              <th className="table__number">Costo unitario</th>
              <th className="table__number">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.productId}>
                <td>{item.productCode}</td>
                <td>{item.productName}</td>
                <td className="table__number">{item.quantity}</td>
                <td className="table__number">
                  <span className="write-in" aria-label="Para anotar a mano" />
                </td>
                <td className="table__number">{formatMoney(item.unitCost)}</td>
                <td className="table__number">{formatMoney(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={5} className="table__number">
                Total
              </th>
              <th className="table__number">{formatMoney(order.total)}</th>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Constancia de recepción: el papel firmado respalda la entrada que luego se registra. */}
      <p className="muted hint">
        Al recibir la mercadería, anote en «Cant. recibida» lo que realmente llegó y firme abajo.
      </p>
      <div className="order-reception">
        {['Recibido por', 'Fecha de recepción', 'Firma'].map((label) => (
          <div key={label}>
            <span className="order-reception__line" />
            <span className="order-reception__label">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
