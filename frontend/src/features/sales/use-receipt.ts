import { useEffect, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { salesService } from '../../services/sales.service';
import type { Sale } from '../../types/sales';

export type ReceiptState =
  { phase: 'loading' } | { phase: 'ready'; sale: Sale } | { phase: 'error'; message: string };

/**
 * Carga el comprobante desde la venta GUARDADA (`GET /api/sales/:id`). Si la
 * venta no existe no hay comprobante: se informa el error, nunca se arma un
 * ticket de prueba.
 */
export function useReceipt(saleId: string, attempt: number): ReceiptState {
  const [state, setState] = useState<ReceiptState & { key: string }>({
    phase: 'loading',
    key: '',
  });
  const key = `${saleId}#${attempt}`;

  useEffect(() => {
    let cancelled = false;

    salesService
      .get(saleId)
      .then((sale) => {
        if (!cancelled) {
          setState({ phase: 'ready', sale, key });
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setState({
            phase: 'error',
            key,
            message:
              caught instanceof ApiError
                ? caught.message
                : 'No se pudo cargar el comprobante. Intente de nuevo.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [saleId, key]);

  // Mientras la clave no coincide, el resultado guardado es de otra venta.
  return state.key === key ? state : { phase: 'loading' };
}
