import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { inventoryService } from '../../services/inventory.service';
import type { LowStockAlert } from '../../types/inventory';

/** Cada cuánto se vuelve a consultar el stock bajo sin que el dueño recargue la página. */
export const LOW_STOCK_REFRESH_MS = 15_000;

interface LowStockState {
  phase: 'loading' | 'ready' | 'failed';
  alerts: LowStockAlert[];
  message?: string;
}

/**
 * Alertas de stock bajo para el panel principal (HU-08).
 *
 * HU-08 pide que la alerta aparezca y desaparezca "sin recargar manualmente".
 * Para eso se consulta de nuevo cada `LOW_STOCK_REFRESH_MS` y también cuando el
 * dueño vuelve a la pestaña (por ejemplo, después de registrar un conteo).
 */
export function useLowStockAlerts() {
  const [state, setState] = useState<LowStockState>({ phase: 'loading', alerts: [] });

  const load = useCallback(async () => {
    try {
      const alerts = await inventoryService.listLowStock();

      setState({ phase: 'ready', alerts });
    } catch (error) {
      setState((current) => ({
        phase: 'failed',
        // Si ya había alertas, se conservan en pantalla aunque falle una consulta.
        alerts: current.alerts,
        message:
          error instanceof ApiError
            ? error.message
            : 'Ocurrió un error inesperado al consultar el stock.',
      }));
    }
  }, []);

  useEffect(() => {
    void load();

    const interval = window.setInterval(() => void load(), LOW_STOCK_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    // Limpieza: al salir del panel se detiene el temporizador y el oyente.
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  return { ...state, reload: load };
}
