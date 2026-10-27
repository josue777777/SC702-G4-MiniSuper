import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { inventoryService } from '../../services/inventory.service';
import { productsService } from '../../services/products.service';
import { purchaseOrdersService } from '../../services/purchase-orders.service';
import { salesService } from '../../services/sales.service';
import {
  summarizeInventory,
  summarizePendingOrders,
  topProductsByValue,
  valueByCategory,
  type BarDatum,
  type InventorySummary,
  type PendingOrdersSummary,
} from './dashboard-metrics';
import type { DailySalesSummary } from '../../types/sales';

/** Cada cuánto se actualiza el panel solo, igual que las alertas de HU-08. */
export const DASHBOARD_REFRESH_MS = 15_000;

export interface DashboardData {
  dailySales: DailySalesSummary;
  inventory: InventorySummary;
  pendingOrders: PendingOrdersSummary;
  lowStockCount: number;
  expiredCount: number;
  expiringSoonCount: number;
  topProducts: BarDatum[];
  categories: BarDatum[];
}

interface DashboardState {
  phase: 'loading' | 'ready' | 'failed';
  data: DashboardData | null;
  message?: string;
}

/**
 * Datos del panel principal: productos, pedidos y alertas, consultados en
 * paralelo. Se actualiza cada 15 s y al volver a la pestaña, para que lo que se
 * hizo en otra pantalla (un pedido, un conteo) se vea sin recargar.
 */
export function useDashboard() {
  const [state, setState] = useState<DashboardState>({ phase: 'loading', data: null });

  const load = useCallback(async () => {
    try {
      const [products, orders, lowStock, expirations, dailySales] = await Promise.all([
        productsService.list(),
        purchaseOrdersService.list(),
        inventoryService.listLowStock(),
        inventoryService.listExpirations(),
        salesService.dailySummary(),
      ]);

      setState({
        phase: 'ready',
        data: {
          dailySales,
          inventory: summarizeInventory(products),
          pendingOrders: summarizePendingOrders(orders),
          lowStockCount: lowStock.length,
          expiredCount: expirations.filter((alert) => alert.status === 'EXPIRED').length,
          expiringSoonCount: expirations.filter((alert) => alert.status === 'EXPIRING_SOON').length,
          topProducts: topProductsByValue(products),
          categories: valueByCategory(products),
        },
      });
    } catch (error) {
      setState((current) => ({
        phase: 'failed',
        // Si ya había datos, se conservan aunque falle una actualización.
        data: current.data,
        message:
          error instanceof ApiError
            ? error.message
            : 'Ocurrió un error inesperado. Intente de nuevo.',
      }));
    }
  }, []);

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

  return { ...state, reload: load };
}
