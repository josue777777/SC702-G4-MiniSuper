import { useState } from 'react';
import { Pagination } from '../../components/Pagination';
import { usePagination } from '../../components/use-pagination';
import type { PurchaseOrderSummary } from '../../types/purchase-orders';
import type { Supplier } from '../../types/suppliers';
import { formatDateTime } from '../inventory/inventory-count';
import { formatMoney } from '../products/money';
import {
  EMPTY_ORDER_FILTERS,
  filterOrders,
  hasOrderFilters,
  STATUS_FILTER_LABELS,
  type OrderFilters,
  type OrderStatusFilter,
} from './order-filters';
import { formatOrderNumber, STATUS_LABELS } from './purchase-order-form';

interface PurchaseOrderHistoryProps {
  orders: PurchaseOrderSummary[];
  suppliers: Supplier[];
  /** Proveedor del filtro; `''` = todos. */
  filter: string;
  busy: boolean;
  onFilterChange: (supplierId: string) => void;
  onOpen: (id: string) => void;
  /** «N productos»: abre solo la lista de productos de ese pedido. */
  onShowProducts: (order: PurchaseOrderSummary) => void;
}

/**
 * Historial de pedidos (HU-22): fecha, proveedor, productos y costo de cada
 * pedido, del más reciente al más antiguo, en páginas de 20. Se filtra por
 * proveedor (lo pide el servidor), por estado (también «con carga pendiente»,
 * HU-38), por período y con un buscador (PED-0007, factura, proveedor o
 * producto). Los filtros se aplican solos, al cambiarlos.
 */
export function PurchaseOrderHistory({
  orders,
  suppliers,
  filter,
  busy,
  onFilterChange,
  onOpen,
  onShowProducts,
}: PurchaseOrderHistoryProps) {
  const [filters, setFilters] = useState<OrderFilters>(EMPTY_ORDER_FILTERS);
  const visible = filterOrders(orders, filters);
  const pages = usePagination(visible, `${filter}|${JSON.stringify(filters)}`);
  const filterName = suppliers.find((supplier) => supplier.id === filter)?.name;
  const filtered = hasOrderFilters(filters);

  function set<K extends keyof OrderFilters>(key: K, value: OrderFilters[K]): void {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="card">
      <header className="card__header">
        <h2>Historial de pedidos</h2>
        {filtered ? (
          <span className="muted" role="status">
            {visible.length} de {orders.length} pedidos
          </span>
        ) : null}
      </header>

      <div className="row-actions" role="search" aria-label="Filtros del historial de pedidos">
        <label className="toolbar__filter">
          <span>Buscar</span>
          <input
            type="search"
            value={filters.search}
            maxLength={60}
            placeholder="PED-0007, factura, producto…"
            aria-label="Buscar pedido por número, factura, proveedor o producto"
            onChange={(event) => set('search', event.target.value)}
          />
        </label>
        <label className="toolbar__filter">
          <span>Proveedor</span>
          <select value={filter} onChange={(event) => onFilterChange(event.target.value)}>
            <option value="">Todos</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <label className="toolbar__filter">
          <span>Estado</span>
          <select
            value={filters.status}
            onChange={(event) => set('status', event.target.value as OrderStatusFilter)}
          >
            <option value="">Todos</option>
            {(Object.keys(STATUS_FILTER_LABELS) as Exclude<OrderStatusFilter, ''>[]).map(
              (status) => (
                <option key={status} value={status}>
                  {STATUS_FILTER_LABELS[status]}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="toolbar__filter">
          <span>Desde</span>
          <input
            type="date"
            value={filters.from}
            max={filters.to === '' ? undefined : filters.to}
            onChange={(event) => set('from', event.target.value)}
          />
        </label>
        <label className="toolbar__filter">
          <span>Hasta</span>
          <input
            type="date"
            value={filters.to}
            min={filters.from === '' ? undefined : filters.from}
            onChange={(event) => set('to', event.target.value)}
          />
        </label>
        {filtered ? (
          <button type="button" className="button" onClick={() => setFilters(EMPTY_ORDER_FILTERS)}>
            Limpiar filtros
          </button>
        ) : null}
      </div>

      {orders.length > 0 && visible.length === 0 ? (
        <p className="muted" role="status">
          Ningún pedido cumple los filtros.
        </p>
      ) : null}

      {orders.length === 0 ? (
        <p className="muted">
          {filterName === undefined
            ? 'Todavía no hay pedidos registrados. Use «+ Nuevo pedido».'
            : `${filterName} no tiene pedidos registrados.`}
        </p>
      ) : visible.length === 0 ? null : (
        <div className="table-wrapper">
          <table className="table" aria-label="Historial de pedidos">
            <thead>
              <tr>
                <th>N.º</th>
                <th>Fecha</th>
                <th>Proveedor</th>
                <th>Productos</th>
                <th className="table__number">Costo total</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {pages.pageItems.map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{formatOrderNumber(order.number)}</strong>
                  </td>
                  <td>{formatDateTime(order.createdAt)}</td>
                  <td>{order.supplierName}</td>
                  <td>
                    {/*
                      Uno se ve directo; si son varios, solo cuántos, y el botón abre SOLO
                      esa lista (lo que se tocó), así la fila no crece (reglas 4 y 12).
                      El pedido completo es «Ver pedido».
                    */}
                    {order.productNames.length === 1 ? (
                      order.productNames[0]
                    ) : (
                      <button
                        type="button"
                        className="button"
                        aria-label={`Ver los ${order.productNames.length} productos del pedido ${formatOrderNumber(order.number)}`}
                        onClick={() => onShowProducts(order)}
                      >
                        {order.productNames.length} productos
                      </button>
                    )}
                  </td>
                  <td className="table__number">{formatMoney(order.total)}</td>
                  <td>
                    <span
                      className={
                        order.status === 'RECEIVED' ? 'badge badge--ok' : 'badge badge--warning'
                      }
                    >
                      {STATUS_LABELS[order.status]}
                    </span>
                    {/* HU-38: entregas registradas que todavía no suben el stock. */}
                    {order.pendingLoads === 0 ? null : (
                      <>
                        {' '}
                        <span className="badge badge--muted">
                          {order.pendingLoads === 1
                            ? 'Carga pendiente'
                            : `${order.pendingLoads} cargas pendientes`}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="table__number">
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      aria-label={`Ver pedido ${formatOrderNumber(order.number)}`}
                      onClick={() => onOpen(order.id)}
                    >
                      Ver pedido
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination {...pages} itemLabel="pedidos" onPage={pages.setPage} />
    </section>
  );
}
