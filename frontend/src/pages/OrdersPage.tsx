import { useState } from 'react';
import { PagePlaceholder } from '../components/PagePlaceholder';
import { PurchaseOrderDetail } from '../features/purchase-orders/PurchaseOrderDetail';
import { PurchaseOrderForm } from '../features/purchase-orders/PurchaseOrderForm';
import { PurchaseOrderHistory } from '../features/purchase-orders/PurchaseOrderHistory';
import { usePurchaseOrders } from '../features/purchase-orders/use-purchase-orders';
import type { PurchaseOrderPayload } from '../types/purchase-orders';

/** Pedidos a proveedores: armar el pedido, su PDF y el historial (HU-22, HU-24). */
export function OrdersPage() {
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
    dismissNotice,
  } = usePurchaseOrders();
  const [formOpen, setFormOpen] = useState(false);

  async function handleSubmit(payload: PurchaseOrderPayload): Promise<void> {
    if (await createOrder(payload)) {
      setFormOpen(false);
    }
  }

  return (
    <PagePlaceholder
      title="Pedidos a proveedores"
      summary="Reponer mercancía con una lista sugerida y llevar el control de las compras."
      stories="HU-23, HU-38"
      tasks={[
        'Mostrar los productos con stock por debajo del mínimo y su proveedor sugerido (HU-23).',
        'Permitir ajustar la cantidad sugerida antes de confirmar el pedido (HU-23).',
        'Al llegar la mercadería, registrar la entrada en el Kardex (con o sin pedido) y dejar el pedido como recibido, actualizando el stock y los lotes (HU-38).',
      ]}
    >
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

      {/* Con el formulario abierto, el error se ve dentro de la ventana modal. */}
      {notice === null || (formOpen && notice.kind === 'error') ? null : (
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

      {selected === null ? null : <PurchaseOrderDetail order={selected} onClose={closeOrder} />}

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
    </PagePlaceholder>
  );
}
