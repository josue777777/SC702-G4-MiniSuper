import { useEffect, useState } from 'react';
import { matchesSearch } from '../../components/list-search';
import { ListSearch } from '../../components/ListSearch';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { MODAL_PAGE_SIZE, usePagination } from '../../components/use-pagination';
import { ApiError } from '../../services/api-client';
import { purchaseOrdersService } from '../../services/purchase-orders.service';
import type {
  PurchaseOrder,
  PurchaseOrderSummary,
  ReceiveOrderPayload,
} from '../../types/purchase-orders';
import { formatDateOnly } from '../inventory/inventory-count';
import { formatOrderNumber, STATUS_LABELS } from '../purchase-orders/purchase-order-form';
import { ReceiveOrderModal } from '../purchase-orders/ReceiveOrderModal';
import { ReceiptLoadModal } from './ReceiptLoadModal';

/** Mensaje de un error de la API, o uno genérico. */
function describeError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Ocurrió un error inesperado. Intente de nuevo.';
}

/**
 * Paso de la ventana. Cada «Cancelar» vuelve al paso anterior, nunca a otra
 * pantalla:
 *
 * - `list`: los pedidos que esperan algo (llegar o cargarse);
 * - `order`: un pedido con entregas pendientes de cargar;
 * - `receive`: registrar una entrega (la misma ventana de Pedidos);
 * - `confirm`: la última verificación antes de subir el stock.
 */
type Step =
  | { kind: 'list' }
  | { kind: 'order'; order: PurchaseOrder }
  | { kind: 'receive'; order: PurchaseOrder }
  | { kind: 'confirm'; order: PurchaseOrder; receiptId: string };

/** Entregas del pedido que todavía no se cargaron al inventario. */
function pendingReceipts(order: PurchaseOrder) {
  return order.receipts.filter((receipt) => receipt.loadedAt === null);
}

interface OrderLoadModalProps {
  /** Pedido ya elegido (una dirección vieja `/movimientos?pedido=<id>`). */
  orderId: string | null;
  /** Cargada: el aviso para la pantalla (y se recarga lo que se ve). */
  onDone: (message: string) => void;
  onClose: () => void;
}

/**
 * «Carga de pedido» (HU-38) desde Movimientos: la entrada de mercadería de un
 * pedido completo, todos sus productos a la vez (carga masiva). Es distinta de
 * un ingreso individual, que es de UN producto sin pedido.
 *
 * 1. Se elige el pedido: los que faltan por llegar y los que tienen entregas
 *    sin cargar; se busca por PED-xxxx, proveedor o producto (de 4 en 4).
 * 2. Si tiene entregas sin cargar, se elige cuál cargar o se registra otra.
 * 3. Registrar la entrega es la misma ventana de Pedidos. «Registrar y dejar la
 *    carga pendiente» vuelve a la lista; «Registrar y cargar» pasa al paso 4.
 * 4. La última verificación (`ReceiptLoadModal`): «¿Está seguro…?» y recién
 *    ahí sube el stock.
 *
 * La persona controla a dónde va: «Cancelar» siempre vuelve un paso atrás.
 */
export function OrderLoadModal({ orderId, onDone, onClose }: OrderLoadModalProps) {
  const [orders, setOrders] = useState<PurchaseOrderSummary[] | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'list' });
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const term = search.trim();
  const shown = (orders ?? []).filter((item) =>
    matchesSearch(term, formatOrderNumber(item.number), item.supplierName, ...item.productNames),
  );
  const pages = usePagination(shown, term, MODAL_PAGE_SIZE);

  /** Pedidos que esperan algo: que llegue mercadería o cargar una entrega. */
  async function refresh(): Promise<void> {
    try {
      const list = await purchaseOrdersService.list();

      setOrders(list.filter((item) => item.status !== 'RECEIVED' || item.pendingLoads > 0));
    } catch (failure) {
      setError(describeError(failure));
    }
  }

  /** Abre un pedido en el paso que le toca. */
  async function choose(id: string): Promise<void> {
    setError(null);
    setNotice(null);

    try {
      const found = await purchaseOrdersService.get(id);

      if (pendingReceipts(found).length > 0) {
        setStep({ kind: 'order', order: found });
      } else if (found.status !== 'RECEIVED') {
        setStep({ kind: 'receive', order: found });
      } else {
        setError(`El pedido ${formatOrderNumber(found.number)} ya llegó y está cargado.`);
      }
    } catch (failure) {
      setError(describeError(failure));
    }
  }

  useEffect(() => {
    void refresh();

    if (orderId !== null) {
      void choose(orderId);
    }
  }, [orderId]);

  /** Registra la entrega con la carga pendiente; cargarla es el paso siguiente. */
  async function register(
    order: PurchaseOrder,
    payload: ReceiveOrderPayload,
    invoice: File | null,
  ): Promise<string | null> {
    setBusy(true);

    try {
      let updated = await purchaseOrdersService.receive(order.id, { ...payload, loadNow: false });
      const receipt = updated.receipts.find(
        (candidate) => candidate.invoiceNumber === payload.invoiceNumber,
      );
      let message = `Entrega ${payload.invoiceNumber} del pedido ${formatOrderNumber(order.number)} registrada; la carga quedó pendiente.`;

      if (invoice !== null && receipt !== undefined) {
        try {
          updated = await purchaseOrdersService.attachInvoice(order.id, receipt.id, invoice);
        } catch (failure) {
          message = `${message} El archivo de la factura no se pudo adjuntar: ${describeError(failure)} Adjúntelo desde Pedidos › Ver pedido › Entregas.`;
        }
      }

      await refresh();

      if (payload.loadNow && receipt !== undefined) {
        setStep({ kind: 'confirm', order: updated, receiptId: receipt.id });
      } else {
        setNotice(message);
        setStep({ kind: 'list' });
      }

      return null;
    } catch (failure) {
      return describeError(failure);
    } finally {
      setBusy(false);
    }
  }

  if (step.kind === 'receive') {
    const { order } = step;

    return (
      <ReceiveOrderModal
        order={order}
        busy={busy}
        onSubmit={(payload, invoice) => register(order, payload, invoice)}
        onClose={() =>
          // «Cancelar»: al paso anterior (sus entregas pendientes, o la lista).
          setStep(pendingReceipts(order).length > 0 ? { kind: 'order', order } : { kind: 'list' })
        }
      />
    );
  }

  if (step.kind === 'confirm') {
    const { order } = step;

    return (
      <ReceiptLoadModal
        orderId={order.id}
        receiptId={step.receiptId}
        onDone={onDone}
        onCancel={() => setStep({ kind: 'order', order })}
      />
    );
  }

  if (step.kind === 'order') {
    const { order } = step;

    return (
      <Modal title={`Carga de pedido · ${formatOrderNumber(order.number)}`} onClose={onClose}>
        <p className="muted">
          {order.supplierName}: estas entregas ya se registraron y falta cargarlas al inventario.
        </p>
        <div className="table-wrapper">
          <table className="table" aria-label="Entregas sin cargar">
            <thead>
              <tr>
                <th>Factura</th>
                <th>Llegó</th>
                <th>
                  <span className="visually-hidden">Acción</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pendingReceipts(order).map((receipt) => (
                <tr key={receipt.id}>
                  <td>{receipt.invoiceNumber}</td>
                  <td>{formatDateOnly(receipt.receivedOn)}</td>
                  <td>
                    <button
                      type="button"
                      className="button button--primary"
                      aria-label={`Cargar la factura ${receipt.invoiceNumber}`}
                      onClick={() => setStep({ kind: 'confirm', order, receiptId: receipt.id })}
                    >
                      Cargar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="form__actions">
          {order.status === 'RECEIVED' ? null : (
            <button
              type="button"
              className="button"
              onClick={() => setStep({ kind: 'receive', order })}
            >
              Registrar otra entrega
            </button>
          )}
          <button type="button" className="button" onClick={() => setStep({ kind: 'list' })}>
            ← Volver a los pedidos
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Carga de pedido" onClose={onClose}>
      <p className="muted">
        Elija el pedido: se registra lo que llegó y, después de verificarlo, se cargan todos sus
        productos a la vez, con su factura y sus lotes.
      </p>

      {error === null ? null : (
        <p className="form__error" role="alert">
          {error}
        </p>
      )}

      {notice === null ? null : (
        <p className="alert alert--success" role="status">
          {notice}
        </p>
      )}

      {orders === null ? (
        error === null ? (
          <p className="muted" role="status">
            Cargando pedidos pendientes…
          </p>
        ) : null
      ) : orders.length === 0 ? (
        <p className="muted" role="status">
          No hay pedidos pendientes de recibir ni de cargar.
        </p>
      ) : (
        <>
          <ListSearch
            label="Buscar pedido"
            placeholder="PED-0001, proveedor o producto"
            value={search}
            onChange={setSearch}
          />
          <div className="table-wrapper">
            <table className="table" aria-label="Pedidos pendientes">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Proveedor</th>
                  <th>Estado</th>
                  <th>
                    <span className="visually-hidden">Acción</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pages.pageItems.map((item) => (
                  <tr key={item.id}>
                    <td>{formatOrderNumber(item.number)}</td>
                    <td>{item.supplierName}</td>
                    <td>
                      {STATUS_LABELS[item.status]}
                      {item.pendingLoads === 0 ? null : (
                        <>
                          {' '}
                          <span className="badge badge--warning">
                            {item.pendingLoads === 1
                              ? '1 entrega sin cargar'
                              : `${item.pendingLoads} entregas sin cargar`}
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button button--primary"
                        aria-label={`Cargar ${formatOrderNumber(item.number)}`}
                        onClick={() => void choose(item.id)}
                      >
                        Cargar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...pages} itemLabel="pedidos" onPage={pages.setPage} />
        </>
      )}

      <div className="form__actions">
        <button type="button" className="button" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
