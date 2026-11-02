import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { inventoryService } from '../../services/inventory.service';
import type { ExpirationAlert } from '../../types/inventory';

interface ExpirationReportState {
  phase: 'loading' | 'ready' | 'failed';
  alerts: ExpirationAlert[];
  /** Productos activos con fecha de vencimiento registrada, cercana o no. */
  withDateCount: number;
  message?: string;
}

/** Datos del reporte de vencidos y próximos a vencer (HU-27). */
export function useExpirationReport() {
  const [state, setState] = useState<ExpirationReportState>({
    phase: 'loading',
    alerts: [],
    withDateCount: 0,
  });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, phase: 'loading' }));

    try {
      const [alerts, settings] = await Promise.all([
        inventoryService.listExpirations(),
        inventoryService.listProductSettings(),
      ]);

      setState({
        phase: 'ready',
        alerts,
        withDateCount: settings.filter((product) => product.expirationDate !== null).length,
      });
    } catch (error) {
      setState({
        phase: 'failed',
        alerts: [],
        withDateCount: 0,
        message: error instanceof ApiError ? error.message : 'Error al consultar los vencimientos.',
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
}
