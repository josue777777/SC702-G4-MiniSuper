import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { creditService } from '../../services/credit.service';
import type { CreditSummary, Payment } from '../../types/credit';

interface Loaded {
  /** Cliente y versión de la carga: una respuesta tardía de otra ficha se ignora. */
  key: string;
  customerId: string;
  credit: CreditSummary | null;
  payments: Payment[];
  error: string | null;
}

/**
 * Cuenta de un cliente (HU-19): su deuda con los fiados y su historial de abonos.
 * `reload()` vuelve a pedirlos al servidor (tras un abono, por ejemplo): mientras
 * llegan se sigue mostrando lo anterior de ESE cliente, sin parpadeo, y nunca se
 * muestra la ficha de otro. El saldo siempre viene del servidor; no se calcula aquí.
 */
export function useCustomerAccount(customerId: string) {
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = `${customerId}:${version}`;

  useEffect(() => {
    let cancelled = false;

    Promise.all([creditService.get(customerId), creditService.listPayments(customerId)])
      .then(([credit, payments]) => {
        if (!cancelled) {
          setLoaded({ key, customerId, credit, payments, error: null });
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setLoaded({
            key,
            customerId,
            credit: null,
            payments: [],
            error:
              caught instanceof ApiError
                ? caught.message
                : 'No se pudo cargar la cuenta del cliente.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [customerId, key]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);
  const current = loaded?.customerId === customerId ? loaded : null;

  return {
    credit: current?.credit ?? null,
    payments: current?.payments ?? [],
    error: current?.error ?? null,
    /** Todavía no hay datos de este cliente. */
    loading: current === null,
    /** Hay datos, pero se están pidiendo unos más nuevos. */
    refreshing: current !== null && current.key !== key,
    reload,
  };
}
