/**
 * Deuda y fiados de UN cliente, para su cuenta y para el formulario de abono (HU-19).
 * Todo viene del servidor: el saldo nunca se calcula aquí.
 */
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { creditService } from '../../services/credit.service';
import type { CreditSummary } from '../../types/credit';

interface Loaded {
  /** Cliente y versión de la carga: una respuesta tardía de otro cliente se ignora. */
  key: string;
  customerId: string;
  credit: CreditSummary | null;
  error: string | null;
}

/**
 * Pide al servidor la deuda del cliente y sus fiados. `reload()` vuelve a pedirlos
 * (tras un abono, o si el servidor dijo que el saldo cambió): mientras llegan se
 * sigue mostrando lo anterior de ESE cliente, sin parpadeo, y nunca se muestra la
 * cuenta de otro.
 *
 * @param customerId El cliente elegido.
 * @returns `credit` (o `null` mientras no hay datos), `error`, `loading` (todavía no
 * hay datos de este cliente), `refreshing` (hay datos y se piden más nuevos) y `reload`.
 */
export function useCustomerCredit(customerId: string) {
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = `${customerId}:${version}`;

  useEffect(() => {
    let cancelled = false;

    creditService
      .get(customerId)
      .then((credit) => {
        if (!cancelled) {
          setLoaded({ key, customerId, credit, error: null });
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setLoaded({
            key,
            customerId,
            credit: null,
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
    error: current?.error ?? null,
    loading: current === null,
    refreshing: current !== null && current.key !== key,
    reload,
  };
}
