import { matchesSearch } from '../../components/list-search';
import type { PurchaseOrderStatus, PurchaseOrderSummary } from '../../types/purchase-orders';
import { formatOrderNumber } from './purchase-order-form';

/**
 * Filtros del historial de pedidos (HU-22), sin React. Se aplican en el
 * navegador sobre la lista ya cargada (los pedidos de un negocio son pocos):
 * así responden al instante, sin botón «Buscar» (docs/PANTALLAS.md, regla 10).
 */

/** Estado del filtro: uno del pedido, o «con carga pendiente» (HU-38). */
export type OrderStatusFilter = '' | PurchaseOrderStatus | 'PENDING_LOAD';

export interface OrderFilters {
  /** PED-0007, número de factura, proveedor o producto. */
  search: string;
  status: OrderStatusFilter;
  /** Días `AAAA-MM-DD` de Costa Rica, ambos incluidos; `''` = sin límite. */
  from: string;
  to: string;
}

export const EMPTY_ORDER_FILTERS: OrderFilters = { search: '', status: '', from: '', to: '' };

export const STATUS_FILTER_LABELS: Record<Exclude<OrderStatusFilter, ''>, string> = {
  PENDING: 'Pendientes',
  PARTIAL: 'Recibidos en parte',
  RECEIVED: 'Recibidos',
  PENDING_LOAD: 'Con carga pendiente',
};

/** Día del pedido en Costa Rica (`AAAA-MM-DD`). */
function orderDay(order: PurchaseOrderSummary): string {
  return new Date(order.createdAt).toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
}

/** ¿Hay algún filtro puesto (además del proveedor)? */
export function hasOrderFilters(filters: OrderFilters): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.status !== '' ||
    filters.from !== '' ||
    filters.to !== ''
  );
}

/**
 * Los pedidos que cumplen todos los filtros, en el mismo orden.
 *
 * @example
 * filterOrders(orders, { search: 'F-120', status: 'PARTIAL', from: '2026-11-01', to: '' })
 * // → los recibidos en parte desde el 1.º de noviembre con una entrega de la factura F-120
 */
export function filterOrders(
  orders: PurchaseOrderSummary[],
  filters: OrderFilters,
): PurchaseOrderSummary[] {
  const term = filters.search.trim();

  return orders.filter((order) => {
    if (filters.status === 'PENDING_LOAD' ? order.pendingLoads === 0 : false) {
      return false;
    }

    if (
      filters.status !== '' &&
      filters.status !== 'PENDING_LOAD' &&
      order.status !== filters.status
    ) {
      return false;
    }

    const day = orderDay(order);

    if ((filters.from !== '' && day < filters.from) || (filters.to !== '' && day > filters.to)) {
      return false;
    }

    return (
      term === '' ||
      matchesSearch(
        term,
        formatOrderNumber(order.number),
        order.supplierName,
        ...order.invoiceNumbers,
        ...order.productNames,
      )
    );
  });
}
