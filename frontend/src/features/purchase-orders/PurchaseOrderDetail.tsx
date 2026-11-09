import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { MODAL_PAGE_SIZE, usePagination } from '../../components/use-pagination';
import { purchaseOrdersService } from '../../services/purchase-orders.service';
import type {
  PurchaseOrder,
  PurchaseReceipt,
  ReceiveOrderPayload,
} from '../../types/purchase-orders';
import type { Notice } from '../products/use-products';
import { useSession } from '../auth/session-context';
import { BusinessDocumentFooter, BusinessDocumentHeader } from '../business/BusinessDocument';
import { formatDateOnly, formatDateTime } from '../inventory/inventory-count';
import { LabelPrintModal } from '../labels/LabelPrintModal';
import { formatMoney } from '../products/money';
import { INVOICE_ACCEPT, invoiceFileError } from './invoice-file';
import { InvoicePreview } from './InvoicePreview';
import { formatOrderNumber, loadUrl, STATUS_LABELS } from './purchase-order-form';
import { ReceiveOrderModal } from './ReceiveOrderModal';

interface PurchaseOrderDetailProps {
  order: PurchaseOrder;
  busy: boolean;
  /** Aviso de la última acción (se ve aquí, dentro de la ventana). */
  notice: Notice | null;
  onDismissNotice: () => void;
  onClose: () => void;
  /** HU-38: cada acción devuelve el error del servidor, o `null` si salió bien. */
  onAttachInvoice: (receiptId: string, invoiceNumber: string, file: File) => Promise<string | null>;
  /**
   * Registra una entrega con la carga pendiente: el error, o el id de la
   * entrega (para confirmar su carga en Movimientos).
   */
  onRegisterDelivery: (
    payload: ReceiveOrderPayload,
    invoice: File | null,
  ) => Promise<{ error: string } | { receiptId: string }>;
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
 * En pantalla es la información del pedido: datos, productos (con lo recibido)
 * y entregas. Al imprimirlo para el proveedor, el papel trae además la columna
 * «Cant. recibida» en blanco (si no llegó nada), el encabezado y el pie del
 * negocio (logo y datos de Configuración › General) y la constancia: «Generado
 * por» con el usuario de la sesión, y fecha de recepción y firma para llenar a
 * mano (`print-only`). Ese papel respalda la entrada de mercadería que
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
 * Entregas (HU-38): «Registrar entrega» abre su ventana AQUÍ, sobre «Ver
 * pedido»: la factura con su fecha real y lo que llegó, con sus lotes. La
 * persona decide a dónde va:
 *
 * - «Cancelar» vuelve a «Ver pedido», sin guardar nada.
 * - «Registrar y dejar la carga pendiente» guarda la entrega y vuelve a «Ver
 *   pedido»: la entrega queda con su botón «Cargar al inventario».
 * - «Registrar y cargar al inventario» guarda la entrega y lleva a Movimientos
 *   › «Carga de pedido», con la entrega ya cargada en pantalla para una última
 *   verificación («¿Está seguro…?»): ahí sube el stock. Lo mismo hace
 *   «Cargar al inventario» de una entrega pendiente.
 *
 * La columna «Cant. recibida» muestra lo recibido hasta ahora (en blanco
 * mientras no llega nada, para anotarlo a mano en el papel). Un pedido que
 * llegó en parte se puede dar por concluido.
 */
export function PurchaseOrderDetail({
  order,
  busy,
  notice,
  onDismissNotice,
  onClose,
  onAttachInvoice,
  onRegisterDelivery,
  onConclude,
}: PurchaseOrderDetailProps) {
  const navigate = useNavigate();
  /** Ventana «Registrar entrega» abierta, sobre «Ver pedido». */
  const [receiving, setReceiving] = useState(false);
  const contact = [order.supplierPhone, order.supplierEmail].filter(Boolean).join(' · ');
  const { can, user } = useSession();
  const [labelling, setLabelling] = useState(false);
  const [confirmingConclude, setConfirmingConclude] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<PurchaseReceipt | null>(null);
  // En pantalla, de 4 en 4 (regla 2); el papel impreso lleva todos los productos.
  const products = usePagination(order.items, order.id, MODAL_PAGE_SIZE);
  const onPage = new Set(products.pageItems.map((item) => item.productId));
  const receipts = usePagination(order.receipts, order.id, MODAL_PAGE_SIZE);
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
        <BusinessDocumentHeader title={`Pedido a proveedor ${formatOrderNumber(order.number)}`}>
          <span>{formatDateTime(order.createdAt)}</span>
        </BusinessDocumentHeader>

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

        <h3 className="no-print">Productos</h3>
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
                <tr
                  key={item.productId}
                  className={onPage.has(item.productId) ? undefined : 'print-only-row'}
                >
                  <td>{item.productCode}</td>
                  <td>{item.productName}</td>
                  <td className="table__number">{item.quantity}</td>
                  <td className="table__number">
                    {/*
                      Lo recibido en el sistema. Si todavía no llegó nada: en pantalla 0;
                      en el papel impreso, una línea en blanco para anotarlo a mano.
                    */}
                    {item.receivedQuantity > 0 ? (
                      item.receivedQuantity
                    ) : (
                      <>
                        <span className="no-print">0</span>
                        <span className="print-only">
                          <span className="write-in" aria-label="Para anotar a mano" />
                        </span>
                      </>
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
        <div className="no-print">
          <Pagination {...products} itemLabel="productos" onPage={products.setPage} />
        </div>

        {/*
          Constancia: solo en el papel (imprimir o PDF). Sin instrucciones a propósito:
          el mismo papel sirve para enviarlo al proveedor y para la revisión al recibir.
          En pantalla no aporta: la entrega se registra aquí.
        */}
        <div className="print-only">
          <div className="order-reception">
            {/* Quién lo generó ya se sabe: va escrito. Lo demás se llena a mano. */}
            <div>
              <span className="order-reception__line order-reception__line--filled">
                {user.name}
              </span>
              <span className="order-reception__label">Generado por</span>
            </div>
            {['Fecha de recepción', 'Firma'].map((label) => (
              <div key={label}>
                <span className="order-reception__line" />
                <span className="order-reception__label">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <BusinessDocumentFooter generatedBy={user.name} />
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
                  <th>Inventario y factura</th>
                </tr>
              </thead>
              <tbody>
                {receipts.pageItems.map((receipt) => (
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
                      <div className="row-actions">
                        {receipt.loadedAt === null ? (
                          <button
                            type="button"
                            className="button button--primary"
                            disabled={busy}
                            aria-label={`Cargar al inventario la factura ${receipt.invoiceNumber}`}
                            onClick={() => navigate(loadUrl(order.id, receipt.id))}
                          >
                            Cargar al inventario
                          </button>
                        ) : (
                          <span className="badge badge--ok">
                            Cargada · {formatDateTime(receipt.loadedAt)}
                          </span>
                        )}
                        {receipt.invoiceFile === null ? (
                          <AttachInvoiceButton
                            receipt={receipt}
                            busy={busy}
                            onPick={(file) =>
                              void run(() =>
                                onAttachInvoice(receipt.id, receipt.invoiceNumber, file),
                              )
                            }
                            onInvalid={setError}
                          />
                        ) : (
                          <button
                            type="button"
                            className="button"
                            aria-label={`Ver factura del proveedor ${receipt.invoiceNumber}`}
                            onClick={() => setViewing(receipt)}
                          >
                            📄 Ver factura proveedor
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            {...receipts}
            itemLabel="entregas"
            label="Páginas de entregas"
            onPage={receipts.setPage}
          />
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

      {notice === null ? null : (
        <p className={`alert alert--${notice.kind}`} role="status">
          {notice.text}
          <button
            type="button"
            className="alert__close"
            onClick={onDismissNotice}
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </p>
      )}

      <div className="form__actions">
        {order.status === 'RECEIVED' ? null : (
          <button
            type="button"
            className="button button--primary"
            disabled={busy}
            onClick={() => setReceiving(true)}
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
          onSubmit={async (payload, invoice) => {
            const result = await onRegisterDelivery(payload, invoice);

            if ('error' in result) {
              return result.error;
            }

            if (payload.loadNow) {
              // «Registrar y cargar»: la última verificación y la carga, en Movimientos.
              navigate(loadUrl(order.id, result.receiptId));
            } else {
              // «Dejar la carga pendiente»: de vuelta a «Ver pedido», con el aviso.
              setReceiving(false);
            }

            return null;
          }}
          onClose={() => setReceiving(false)}
        />
      ) : null}

      {viewing === null ? null : (
        <InvoiceViewer
          order={order}
          receipt={viewing}
          busy={busy}
          onReplace={(file) =>
            void run(() => onAttachInvoice(viewing.id, viewing.invoiceNumber, file))
          }
          onClose={() => setViewing(null)}
        />
      )}

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

/**
 * «Adjuntar factura» de una entrega que todavía no la tiene: abre el selector
 * de archivos del dispositivo y adjunta el PDF o la foto elegida.
 */
function AttachInvoiceButton({
  receipt,
  busy,
  onPick,
  onInvalid,
}: {
  receipt: PurchaseReceipt;
  busy: boolean;
  onPick: (file: File) => void;
  onInvalid: (message: string) => void;
}) {
  return (
    <label className={busy ? 'button button--disabled' : 'button'}>
      📎 Adjuntar factura
      <input
        type="file"
        className="visually-hidden"
        accept={INVOICE_ACCEPT}
        disabled={busy}
        aria-label={`Adjuntar factura del proveedor ${receipt.invoiceNumber}`}
        onChange={(event) => {
          const file = event.target.files?.[0];

          event.target.value = '';

          if (file === undefined) {
            return;
          }

          const problem = invoiceFileError(file);

          if (problem === null) {
            onPick(file);
          } else {
            onInvalid(problem);
          }
        }}
      />
    </label>
  );
}

/**
 * La factura del proveedor de una entrega, en su propia ventana: se pide al
 * servidor al abrirla y se muestra con el mismo visor que al registrar. Desde
 * aquí también se reemplaza (si se adjuntó la equivocada).
 */
function InvoiceViewer({
  order,
  receipt,
  busy,
  onReplace,
  onClose,
}: {
  order: PurchaseOrder;
  receipt: PurchaseReceipt;
  busy: boolean;
  onReplace: (file: File) => void;
  onClose: () => void;
}) {
  const [file, setFile] = useState<Blob | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const uploadedAt = receipt.invoiceFile?.uploadedAt;

  useEffect(() => {
    let cancelled = false;

    purchaseOrdersService
      .invoiceFile(order.id, receipt.id)
      .then((blob) => {
        if (!cancelled) {
          setFile(blob);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed('No se pudo abrir la factura. Intente de nuevo.');
        }
      });

    return () => {
      cancelled = true;
    };
    // Al reemplazarla cambia la fecha: se vuelve a pedir.
  }, [order.id, receipt.id, uploadedAt]);

  return (
    <Modal title={`Factura del proveedor · ${receipt.invoiceNumber}`} size="wide" onClose={onClose}>
      {failed !== null ? <p className="alert alert--error">{failed}</p> : null}
      {file === null && failed === null ? <p className="muted">Abriendo la factura…</p> : null}
      {file === null ? null : (
        <InvoicePreview file={file} name={receipt.invoiceFile?.name ?? 'factura'} />
      )}
      <div className="form__actions">
        <label className={busy ? 'button button--disabled' : 'button'}>
          Reemplazar archivo
          <input
            type="file"
            className="visually-hidden"
            accept={INVOICE_ACCEPT}
            disabled={busy}
            aria-label={`Reemplazar factura del proveedor ${receipt.invoiceNumber}`}
            onChange={(event) => {
              const picked = event.target.files?.[0];

              event.target.value = '';

              if (picked !== undefined && invoiceFileError(picked) === null) {
                onReplace(picked);
              } else if (picked !== undefined) {
                setFailed(invoiceFileError(picked));
              }
            }}
          />
        </label>
        <button type="button" className="button" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
