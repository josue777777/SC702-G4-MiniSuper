import { useState } from 'react';
import { Modal } from '../../components/Modal';
import type { PurchaseOrder, ReceiveOrderPayload } from '../../types/purchase-orders';
import { useSession } from '../auth/session-context';
import { formatDateOnly, formatDateTime } from '../inventory/inventory-count';
import { LabelPrintModal } from '../labels/LabelPrintModal';
import { formatMoney } from '../products/money';
import { formatOrderNumber, STATUS_LABELS } from './purchase-order-form';
import { ReceiveOrderModal } from './ReceiveOrderModal';

interface PurchaseOrderDetailProps {
  order: PurchaseOrder;
  busy: boolean;
  onClose: () => void;
  /** HU-38: cada acción devuelve el error del servidor, o `null` si salió bien. */
  onReceive: (payload: ReceiveOrderPayload) => Promise<string | null>;
  onLoadReceipt: (receiptId: string, invoiceNumber: string) => Promise<string | null>;
  onConclude: () => Promise<string | null>;
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
 *
 * Se abre en una ventana modal sobre la lista («Ver pedido»): la lista no se
 * mueve y al cerrar se vuelve a la misma fila.
 *
 * «Etiquetas» (HU-07) abre la impresión de etiquetas con los productos del
 * pedido y una etiqueta por unidad, para rotular la mercadería cuando llega.
 *
 * Entregas (HU-38): «Registrar entrega» anota cada factura con su fecha real y
 * lo que llegó; la columna «Cant. recibida» muestra lo recibido hasta ahora (en
 * blanco mientras no llega nada, para anotarlo a mano en el papel). Cada
 * entrega con la carga pendiente tiene su botón «Cargar al inventario». Un
 * pedido que llegó en parte se puede dar por concluido.
 */
export function PurchaseOrderDetail({
  order,
  busy,
  onClose,
  onReceive,
  onLoadReceipt,
  onConclude,
}: PurchaseOrderDetailProps) {
  const contact = [order.supplierPhone, order.supplierEmail].filter(Boolean).join(' · ');
  const { can } = useSession();
  const [labelling, setLabelling] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [confirmingConclude, setConfirmingConclude] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = order.items.reduce((sum, item) => sum + item.pendingQuantity, 0);

  async function run(action: () => Promise<string | null>): Promise<void> {
    setError(await action());
  }

  return (
    <Modal
      title={`Pedido ${formatOrderNumber(order.number)} · ${order.supplierName}`}
      size="wide"
      onClose={onClose}
    >
      <section className="print-area" aria-label="Documento del pedido">
        <div className="print-only">
          <h1>Pedido a proveedor {formatOrderNumber(order.number)}</h1>
        </div>

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
            <dd>
              {STATUS_LABELS[order.status]}
              {order.receivedOn === null ? '' : ` · ${formatDateOnly(order.receivedOn)}`}
            </dd>
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
          <table className="table" aria-label="Productos del pedido">
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
                    {/* Lo recibido en el sistema; en blanco, para anotarlo a mano en el papel. */}
                    {item.receivedQuantity > 0 ? (
                      item.receivedQuantity
                    ) : (
                      <span className="write-in" aria-label="Para anotar a mano" />
                    )}
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

      {order.receipts.length === 0 ? null : (
        <section aria-label="Entregas del pedido">
          <h3>Entregas</h3>
          <div className="table-wrapper">
            <table className="table" aria-label="Entregas del pedido">
              <thead>
                <tr>
                  <th>Factura</th>
                  <th>Llegó</th>
                  <th>Productos</th>
                  <th>Inventario</th>
                </tr>
              </thead>
              <tbody>
                {order.receipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td>
                      <strong>{receipt.invoiceNumber}</strong>
                    </td>
                    <td>{formatDateOnly(receipt.receivedOn)}</td>
                    <td>
                      {receipt.items
                        .map((item) => `${item.productName} × ${item.quantity}`)
                        .join(' · ')}
                    </td>
                    <td>
                      {receipt.loadedAt === null ? (
                        <button
                          type="button"
                          className="button button--primary"
                          disabled={busy}
                          aria-label={`Cargar al inventario la factura ${receipt.invoiceNumber}`}
                          onClick={() =>
                            void run(() => onLoadReceipt(receipt.id, receipt.invoiceNumber))
                          }
                        >
                          Cargar al inventario
                        </button>
                      ) : (
                        <span className="badge badge--ok">
                          Cargada · {formatDateTime(receipt.loadedAt)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {order.status === 'PARTIAL' ? (
        <p className="muted hint">
          Faltan {missing} unidades. El pedido sigue abierto hasta que llegue todo o se dé por
          concluido.
        </p>
      ) : null}

      {confirmingConclude ? (
        <>
          <p className="alert alert--warning" role="alert">
            Al concluirlo, lo que falta ({missing} unidades) ya no se espera y el pedido queda
            cerrado. Las entregas registradas no cambian.
          </p>
          <div className="form__actions">
            <button
              type="button"
              className="button button--danger-solid"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const failed = await onConclude();

                  setConfirmingConclude(false);

                  return failed;
                })
              }
            >
              Sí, dar por concluido
            </button>
            <button type="button" className="button" onClick={() => setConfirmingConclude(false)}>
              Cancelar
            </button>
          </div>
        </>
      ) : null}

      {error === null ? null : (
        <p className="form__error" role="alert">
          {error}
        </p>
      )}

      <div className="form__actions">
        {order.status === 'RECEIVED' ? null : (
          <button
            type="button"
            className="button button--primary"
            disabled={busy}
            onClick={() => {
              setError(null);
              setReceiving(true);
            }}
          >
            📦 Registrar entrega
          </button>
        )}
        {order.status === 'PARTIAL' && !confirmingConclude ? (
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => setConfirmingConclude(true)}
          >
            Dar por concluido
          </button>
        ) : null}
        <button type="button" className="button" onClick={printOrder}>
          🖨 Imprimir / Guardar PDF
        </button>
        {can('inventory.read') ? (
          <button type="button" className="button" onClick={() => setLabelling(true)}>
            🏷 Etiquetas
          </button>
        ) : null}
        <button type="button" className="button" onClick={onClose}>
          Cerrar
        </button>
      </div>

      {receiving ? (
        <ReceiveOrderModal
          order={order}
          busy={busy}
          onSubmit={onReceive}
          onClose={() => setReceiving(false)}
        />
      ) : null}

      {labelling ? (
        <LabelPrintModal
          scope={{
            kind: 'order',
            orderNumber: formatOrderNumber(order.number),
            items: order.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          }}
          onClose={() => setLabelling(false)}
        />
      ) : null}
    </Modal>
  );
}
