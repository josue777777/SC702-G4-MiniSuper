import type { PurchaseOrderSummary } from '../../types/purchase-orders';
import type { Supplier } from '../../types/suppliers';
import { formatDateTime } from '../inventory/inventory-count';
import { formatMoney } from '../products/money';
import { STATUS_LABELS } from './purchase-order-form';

interface PurchaseOrderHistoryProps {
  orders: PurchaseOrderSummary[];
  suppliers: Supplier[];
  /** Proveedor del filtro; `''` = todos. */
  filter: string;
  busy: boolean;
  onFilterChange: (supplierId: string) => void;
  onOpen: (id: string) => void;
}

/**
 * Historial de pedidos (HU-22): fecha, proveedor, productos y costo de cada
 * pedido, del más reciente al más antiguo, con filtro por proveedor.
 */
export function PurchaseOrderHistory({
  orders,
  suppliers,
  filter,
  busy,
  onFilterChange,
  onOpen,
}: PurchaseOrderHistoryProps) {
  const filterName = suppliers.find((supplier) => supplier.id === filter)?.name;

  return (
    <section className="card">
      <header className="card__header">
        <h2>Historial de pedidos</h2>
        <label className="toolbar__filter">
          <span className="muted">Proveedor:</span>
          <select value={filter} onChange={(event) => onFilterChange(event.target.value)}>
            <option value="">Todos</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {orders.length === 0 ? (
        <p className="muted">
          {filterName === undefined
            ? 'Todavía no hay pedidos registrados. Use «+ Nuevo pedido».'
            : `${filterName} no tiene pedidos registrados.`}
        </p>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Proveedor</th>
                <th>Productos</th>
                <th className="table__number">Costo total</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>{formatDateTime(order.createdAt)}</td>
                  <td>{order.supplierName}</td>
                  <td>{order.productNames.join(', ')}</td>
                  <td className="table__number">{formatMoney(order.total)}</td>
                  <td>
                    <span
                      className={
                        order.status === 'RECEIVED' ? 'badge badge--ok' : 'badge badge--warning'
                      }
                    >
                      {STATUS_LABELS[order.status]}
                    </span>
                  </td>
                  <td className="table__number">
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() => onOpen(order.id)}
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
