import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { inventoryService } from '../../services/inventory.service';
import { purchaseOrdersService } from '../../services/purchase-orders.service';
import { salesService } from '../../services/sales.service';
import type { ExpirationAlert, LowStockAlert } from '../../types/inventory';
import type { PurchaseOrderSummary } from '../../types/purchase-orders';
import type { DailySalesSummary } from '../../types/sales';
import { useSession } from '../auth/session-context';
import { buildUrgencies, type PendingReceipt, type Urgency } from './dashboard-urgencies';

/** Cada cuánto se actualiza el panel solo, igual que las alertas de HU-08. */
export const DASHBOARD_REFRESH_MS = 15_000;

/** Tope de pedidos con cargas pendientes que se abren para listar sus facturas. */
const MAX_ORDERS_WITH_LOADS = 10;

export interface DashboardData {
  /** `null` si el rol no maneja ventas (no se consultan). */
  dailySales: DailySalesSummary | null;
  lowStock: LowStockAlert[];
  expirations: ExpirationAlert[];
  /** Todo lo que pide atención, de lo más grave a lo menos grave. */
  urgencies: Urgency[];
}

interface DashboardState {
  phase: 'loading' | 'ready' | 'failed';
  data: DashboardData | null;
  message?: string;
}

function describeError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Ocurrió un error inesperado. Intente de nuevo.';
}

/** Las facturas sin cargar de los pedidos que avisan tener alguna (HU-38). */
async function pendingReceiptsOf(orders: PurchaseOrderSummary[]): Promise<PendingReceipt[]> {
  const withLoads = orders.filter((order) => order.pendingLoads > 0);
  const details = await Promise.all(
    withLoads.slice(0, MAX_ORDERS_WITH_LOADS).map((order) => purchaseOrdersService.get(order.id)),
  );

  return details.flatMap((order) =>
    order.receipts
      .filter((receipt) => receipt.loadedAt === null)
      .map((receipt) => ({
        orderId: order.id,
        orderNumber: order.number,
        supplierName: order.supplierName,
        receiptId: receipt.id,
        invoiceNumber: receipt.invoiceNumber,
      })),
  );
}

/**
 * Datos del panel principal: las alertas, las entregas sin cargar, los pedidos
 * que esperan mercadería y las ventas del día, consultados en paralelo. Se
 * actualiza cada 15 s y al volver a la pestaña, para que lo hecho en otra
 * pantalla se vea sin recargar (HU-08, HU-37). Pedidos y ventas solo se piden
 * si el rol los maneja (si no, la API respondería 403 y fallaría todo).
 *
 * `loadReceipts` es la acción instantánea de la tarjeta: carga al inventario
 * las facturas pendientes sin salir del panel.
 */
export function useDashboard() {
  const { can } = useSession();
  const canSeeOrders = can('purchasing');
  const canSeeSales = can('sales');
  const [state, setState] = useState<DashboardState>({ phase: 'loading', data: null });

  const load = useCallback(async () => {
    try {
      const [orders, lowStock, expirations, dailySales] = await Promise.all([
        canSeeOrders ? purchaseOrdersService.list() : Promise.resolve(null),
        inventoryService.listLowStock(),
        inventoryService.listExpirations(),
        canSeeSales ? salesService.dailySummary() : Promise.resolve(null),
      ]);
      const pendingReceipts = orders === null ? null : await pendingReceiptsOf(orders);

      setState({
        phase: 'ready',
        data: {
          dailySales,
          lowStock,
          expirations,
          urgencies: buildUrgencies({
            lowStock,
            expirations,
            pendingReceipts,
            ordersToReceive:
              orders === null ? null : orders.filter((order) => order.status !== 'RECEIVED').length,
          }),
        },
      });
    } catch (error) {
      setState((current) => ({
        phase: 'failed',
        // Si ya había datos, se conservan aunque falle una actualización.
        data: current.data,
        message: describeError(error),
      }));
    }
  }, [canSeeOrders, canSeeSales]);

  useEffect(() => {
    void load();

    const interval = window.setInterval(() => void load(), DASHBOARD_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  /**
   * Carga al inventario las facturas pendientes, una por una (cada una en su
   * propia transacción en el servidor). Devuelve el error, o `null` si todas se
   * cargaron; en ambos casos vuelve a consultar el panel.
   */
  const loadReceipts = useCallback(
    async (receipts: PendingReceipt[]): Promise<string | null> => {
      try {
        for (const receipt of receipts) {
          await purchaseOrdersService.loadReceipt(receipt.orderId, receipt.receiptId);
        }

        return null;
      } catch (error) {
        return describeError(error);
      } finally {
        await load();
      }
    },
    [load],
  );

  return { ...state, reload: load, loadReceipts };
}
