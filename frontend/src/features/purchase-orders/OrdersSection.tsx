import { useState } from 'react';
import type { PurchaseOrderPayload } from '../../types/purchase-orders';
import { PurchaseOrderDetail } from './PurchaseOrderDetail';
import { PurchaseOrderForm } from './PurchaseOrderForm';
import { PurchaseOrderHistory } from './PurchaseOrderHistory';
import { usePurchaseOrders } from './use-purchase-orders';

/**
 * Pestaña «Pedidos» de la pantalla Pedidos: armar el pedido a un proveedor, su
 * PDF y el historial (HU-22, HU-24), y registrar lo que llega (HU-38).
 */
export function OrdersSection() {
  const {
    phase,
    suppliers,
    orders,
    message,
    filter,
    setFilter,
    selected,
    notice,
    busy,
    reload,
    createOrder,
    openOrder,
    closeOrder,
    receiveOrder,
    attachInvoice,
    loadReceipt,
    concludeOrder,
    dismissNotice,
  } = usePurchaseOrders();
  const [formOpen, setFormOpen] = useState(false);

  async function handleSubmit(payload: PurchaseOrderPayload): Promise<void> {
    if (await createOrder(payload)) {
      setFormOpen(false);
    }
  }

  return (
    <>
      <div className="toolbar">
        <button
          type="button"
          className="button button--primary"
          disabled={busy || formOpen || phase !== 'ready'}
          onClick={() => {
            closeOrder();
            setFormOpen(true);
          }}
        >
          + Nuevo pedido
        </button>
      </div>

      {/*
        Con el formulario abierto, el error se ve dentro de su ventana; con un
        pedido abierto, todos los avisos se ven dentro de «Ver pedido».
      */}
      {notice === null || selected !== null || (formOpen && notice.kind === 'error') ? null : (
        <p className={`alert alert--${notice.kind}`} role="status">
          {notice.text}
          <button
            type="button"
            className="alert__close"
            onClick={dismissNotice}
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </p>
      )}

      {formOpen ? (
        <PurchaseOrderForm
          suppliers={suppliers}
          busy={busy}
          serverError={notice?.kind === 'error' ? notice.text : null}
          onCancel={() => {
            setFormOpen(false);
            dismissNotice();
          }}
          onSubmit={(payload) => void handleSubmit(payload)}
        />
      ) : null}

      {selected === null ? null : (
        <PurchaseOrderDetail
          order={selected}
          busy={busy}
          onClose={closeOrder}
          notice={notice}
          onDismissNotice={dismissNotice}
          onReceive={(payload, invoice) => receiveOrder(selected, payload, invoice)}
          onAttachInvoice={(receiptId, invoiceNumber, file) =>
            attachInvoice(selected, receiptId, invoiceNumber, file)
          }
          onLoadReceipt={(receiptId, invoiceNumber) =>
            loadReceipt(selected, receiptId, invoiceNumber)
          }
          onConclude={() => concludeOrder(selected)}
        />
      )}

      {phase === 'loading' ? <p className="card muted">Cargando pedidos…</p> : null}

      {phase === 'failed' ? (
        <section className="card">
          <header className="card__header">
            <h2>No se pudieron cargar los pedidos</h2>
            <button type="button" className="button" onClick={() => void reload()}>
              Reintentar
            </button>
          </header>
          <p className="muted">{message}</p>
        </section>
      ) : null}

      {phase === 'ready' ? (
        <PurchaseOrderHistory
          orders={orders}
          suppliers={suppliers}
          filter={filter}
          busy={busy}
          onFilterChange={setFilter}
          onOpen={(id) => {
            setFormOpen(false);
            void openOrder(id);
          }}
        />
      ) : null}
    </>
  );
}
