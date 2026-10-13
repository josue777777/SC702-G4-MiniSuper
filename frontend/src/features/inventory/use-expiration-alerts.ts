import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { inventoryService } from '../../services/inventory.service';
import type { ExpirationAlert } from '../../types/inventory';

/** Los vencimientos cambian por día, así que basta con consultar cada minuto. */
const EXPIRATIONS_REFRESH_MS = 60_000;

interface ExpirationsState {
  phase: 'loading' | 'ready' | 'failed';
  alerts: ExpirationAlert[];
  message?: string;
}

/** Vencidos y próximos a vencer para el panel principal (HU-09). */
export function useExpirationAlerts() {
  const [state, setState] = useState<ExpirationsState>({ phase: 'loading', alerts: [] });

  const load = useCallback(async () => {
    try {
      setState({ phase: 'ready', alerts: await inventoryService.listExpirations() });
    } catch (error) {
      setState((current) => ({
        phase: 'failed',
        alerts: current.alerts,
        message: error instanceof ApiError ? error.message : 'Error al consultar los vencimientos.',
      }));
    }
  }, []);

  useEffect(() => {
    void load();

    const interval = window.setInterval(() => void load(), EXPIRATIONS_REFRESH_MS);
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

  return state;
}
