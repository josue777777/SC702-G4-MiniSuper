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
import { formatOrderNumber, STATUS_LABELS } from '../purchase-orders/purchase-order-form';
import { ReceiveOrderModal } from '../purchase-orders/ReceiveOrderModal';

/** Mensaje de un error de la API, o uno genérico. */
function describeError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Ocurrió un error inesperado. Intente de nuevo.';
}

interface OrderLoadModalProps {
  /** Pedido que ya se eligió (al venir desde Pedidos › «Registrar entrega»). */
  orderId: string | null;
  /** Registrada: el aviso para la pantalla (y se recarga lo que se ve). */
  onDone: (message: string) => void;
  onClose: () => void;
}

/**
 * «Carga de pedido» (HU-38): la entrada de mercadería de un pedido completo,
 * con todos sus productos a la vez (carga masiva). Es distinta de un ingreso
 * individual, que es de UN producto sin pedido.
 *
 * - Desde Pedidos › «Registrar entrega» se llega con el pedido ya elegido.
 * - Desde Movimientos se elige primero el pedido pendiente: se busca por
 *   PED-xxxx, proveedor o producto (de 4 en 4, regla 2).
 *
 * Elegido el pedido, se abre la misma ventana de siempre («Registrar entrega»):
 * factura con su vista previa, lo que llegó de cada producto con sus lotes, y
 * cargarlo ya o dejar la carga pendiente. El pedido queda recibido o parcial.
 */
export function OrderLoadModal({ orderId, onDone, onClose }: OrderLoadModalProps) {
  const [pending, setPending] = useState<PurchaseOrderSummary[] | null>(null);
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const term = search.trim();
  const shown = (pending ?? []).filter((item) =>
    matchesSearch(term, formatOrderNumber(item.number), item.supplierName, ...item.productNames),
  );
  const pages = usePagination(shown, term, MODAL_PAGE_SIZE);

  async function choose(id: string): Promise<void> {
    setError(null);

    try {
      const found = await purchaseOrdersService.get(id);

      if (found.status === 'RECEIVED') {
        setError(`El pedido ${formatOrderNumber(found.number)} ya está recibido.`);
      } else {
        setOrder(found);
      }
    } catch (failure) {
      setError(describeError(failure));
    }
  }

  useEffect(() => {
    if (orderId !== null) {
      void choose(orderId);

      return;
    }

    purchaseOrdersService
      .list()
      .then((list) => setPending(list.filter((item) => item.status !== 'RECEIVED')))
      .catch((failure: unknown) => setError(describeError(failure)));
  }, [orderId]);

  async function receive(
    payload: ReceiveOrderPayload,
    invoice: File | null,
  ): Promise<string | null> {
    if (order === null) {
      return null;
    }

    setBusy(true);

    try {
      const updated = await purchaseOrdersService.receive(order.id, payload);
      const receipt = updated.receipts.find(
        (candidate) => candidate.invoiceNumber === payload.invoiceNumber,
      );
      let message = payload.loadNow
        ? `Entrega ${payload.invoiceNumber} del pedido ${formatOrderNumber(order.number)} cargada al inventario.`
        : `Entrega ${payload.invoiceNumber} del pedido ${formatOrderNumber(order.number)} registrada; la carga quedó pendiente.`;

      if (invoice !== null && receipt !== undefined) {
        try {
          await purchaseOrdersService.attachInvoice(order.id, receipt.id, invoice);
        } catch (failure) {
          message = `${message} El archivo de la factura no se pudo adjuntar: ${describeError(failure)} Adjúntelo desde Pedidos › Ver pedido › Entregas.`;
        }
      }

      onDone(message);

      return null;
    } catch (failure) {
      return describeError(failure);
    } finally {
      setBusy(false);
    }
  }

  if (order !== null) {
    return <ReceiveOrderModal order={order} busy={busy} onSubmit={receive} onClose={onClose} />;
  }

  return (
    <Modal title="Carga de pedido" onClose={onClose}>
      <p className="muted">
        Elija el pedido que llegó: se cargan todos sus productos a la vez, con su factura y sus
        lotes.
      </p>

      {error === null ? null : (
        <p className="form__error" role="alert">
          {error}
        </p>
      )}

      {orderId !== null ? (
        error === null ? (
          <p className="muted" role="status">
            Abriendo el pedido…
          </p>
        ) : null
      ) : pending === null ? (
        error === null ? (
          <p className="muted" role="status">
            Cargando pedidos pendientes…
          </p>
        ) : null
      ) : pending.length === 0 ? (
        <p className="muted" role="status">
          No hay pedidos pendientes de recibir.
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
                    <td>{STATUS_LABELS[item.status]}</td>
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
    </Modal>
  );
}
