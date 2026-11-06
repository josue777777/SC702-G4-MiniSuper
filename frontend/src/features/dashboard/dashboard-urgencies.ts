import type { ExpirationAlert, LowStockAlert } from '../../types/inventory';

/**
 * Las urgencias del panel principal («Lo urgente hoy»), sin React. El panel no
 * muestra decenas de cifras: arma la lista de lo que pide atención, la ordena
 * por gravedad y enseña solo las tres primeras (revelación progresiva). El
 * resto queda a un clic, en una ventana.
 *
 * Todo sale de datos que ya existen (alertas de HU-08 y HU-09, entregas de
 * HU-38 y pedidos): aquí solo se decide qué es más urgente.
 */

/** Gravedad: el color nunca va solo, cada una lleva también su palabra. */
export type UrgencySeverity = 'critical' | 'warning' | 'info';

export const SEVERITY_LABELS: Record<UrgencySeverity, string> = {
  critical: 'Crítico',
  warning: 'Atención',
  info: 'Aviso',
};

/** Una entrega registrada que todavía no se cargó al inventario (HU-38). */
export interface PendingReceipt {
  orderId: string;
  orderNumber: number;
  supplierName: string;
  receiptId: string;
  invoiceNumber: string;
}

/** Qué se puede hacer desde la tarjeta, sin salir del panel. */
export type UrgencyAction =
  | { kind: 'expirations'; label: string }
  | { kind: 'low-stock'; label: string }
  | { kind: 'load-receipts'; label: string; receipts: PendingReceipt[] }
  | { kind: 'link'; label: string; to: string };

export interface Urgency {
  id: string;
  severity: UrgencySeverity;
  title: string;
  detail: string;
  action: UrgencyAction;
}

export interface UrgencyInput {
  lowStock: LowStockAlert[];
  expirations: ExpirationAlert[];
  /** `null` si el rol no maneja pedidos. */
  pendingReceipts: PendingReceipt[] | null;
  /** Pedidos que esperan mercadería (pendientes o recibidos en parte); `null` si no aplica. */
  ordersToReceive: number | null;
}

/** Cuántas urgencias se ven de entrada. */
export const VISIBLE_URGENCIES = 3;

const ORDER: Record<UrgencySeverity, number> = { critical: 0, warning: 1, info: 2 };

/** «Arroz, Café y 3 más»: los nombres que caben en una línea. */
export function namesOf(names: string[], shown = 2): string {
  if (names.length <= shown) {
    return names.join(' y ');
  }

  return `${names.slice(0, shown).join(', ')} y ${names.length - shown} más`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Todas las urgencias, de la más grave a la menos grave (a igual gravedad, en
 * el orden en que se arman: vencidos, stock, cargas, por vencer, pedidos).
 *
 * @example
 * buildUrgencies({ lowStock: [{ stock: 0, … }], expirations: [], pendingReceipts: [], ordersToReceive: 0 })
 * // → [{ id: 'low-stock', severity: 'critical', title: '1 producto sin stock o en su mínimo', … }]
 */
export function buildUrgencies(input: UrgencyInput): Urgency[] {
  const urgencies: Urgency[] = [];
  const expired = input.expirations.filter((alert) => alert.status === 'EXPIRED');
  const expiring = input.expirations.filter((alert) => alert.status === 'EXPIRING_SOON');

  if (expired.length > 0) {
    urgencies.push({
      id: 'expired',
      severity: 'critical',
      title: `${plural(expired.length, 'producto vencido', 'productos vencidos')}`,
      detail: `Retírelos de la venta: ${namesOf(expired.map((alert) => alert.productName))}.`,
      action: { kind: 'expirations', label: 'Ver vencidos' },
    });
  }

  if (input.lowStock.length > 0) {
    const empty = input.lowStock.filter((alert) => alert.stock === 0).length;

    urgencies.push({
      id: 'low-stock',
      severity: empty > 0 ? 'critical' : 'warning',
      title: `${plural(input.lowStock.length, 'producto', 'productos')} sin stock o en su mínimo`,
      detail: `${empty > 0 ? `${empty} ya sin unidades. ` : ''}${namesOf(
        input.lowStock.map((alert) => alert.productName),
      )}.`,
      action: { kind: 'low-stock', label: 'Ver productos' },
    });
  }

  if (input.pendingReceipts !== null && input.pendingReceipts.length > 0) {
    const receipts = input.pendingReceipts;

    urgencies.push({
      id: 'pending-loads',
      severity: 'warning',
      title:
        receipts.length === 1
          ? `Factura ${receipts[0]?.invoiceNumber ?? ''} sin cargar al inventario`
          : `${receipts.length} facturas sin cargar al inventario`,
      detail: `La mercadería llegó pero el stock todavía no la incluye (${namesOf(
        receipts.map((receipt) => receipt.supplierName),
      )}).`,
      action: {
        kind: 'load-receipts',
        label: receipts.length === 1 ? 'Cargar al inventario' : 'Cargar todas',
        receipts,
      },
    });
  }

  if (expiring.length > 0) {
    urgencies.push({
      id: 'expiring',
      severity: 'warning',
      title: `${plural(expiring.length, 'producto vence', 'productos vencen')} en menos de 15 días`,
      detail: `${namesOf(expiring.map((alert) => alert.productName))}.`,
      action: { kind: 'expirations', label: 'Ver por vencer' },
    });
  }

  if (input.ordersToReceive !== null && input.ordersToReceive > 0) {
    urgencies.push({
      id: 'orders',
      severity: 'info',
      title: `${plural(input.ordersToReceive, 'pedido espera', 'pedidos esperan')} mercadería`,
      detail: 'Cuando llegue, regístrela con su factura desde el pedido.',
      action: { kind: 'link', label: 'Ver pedidos', to: '/orders' },
    });
  }

  return urgencies
    .map((urgency, index) => ({ urgency, index }))
    .sort((a, b) => ORDER[a.urgency.severity] - ORDER[b.urgency.severity] || a.index - b.index)
    .map(({ urgency }) => urgency);
}
