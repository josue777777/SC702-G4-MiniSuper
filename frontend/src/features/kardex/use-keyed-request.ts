import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../services/api-client';

type Settled<T> = { key: string; value: T } | { key: string; error: ApiError | Error };

export type RequestState<T> =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; value: T }
  | { phase: 'failed'; message: string; status: number | null };

/**
 * Pide datos a la API cada vez que cambia `key` (`null` = no pedir nada) sin
 * bloquear la pantalla: mientras llegan, el estado es `loading` y el resto de la
 * página sigue usable. Una respuesta que llega tarde, de una clave anterior, se
 * ignora: nunca se muestra el historial de un producto en la ficha de otro.
 *
 * El estado se DEDUCE de la clave de la última respuesta (no se escribe «cargando»
 * al empezar): así cambiar de clave no obliga a guardar estado dentro del efecto.
 */
export function useKeyedRequest<T>(
  key: string | null,
  request: () => Promise<T>,
  fallbackMessage: string,
): RequestState<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const latestRequest = useRef(request);

  useEffect(() => {
    latestRequest.current = request;
  });

  useEffect(() => {
    if (key === null) {
      return undefined;
    }

    let cancelled = false;

    latestRequest
      .current()
      .then((value) => {
        if (!cancelled) {
          setSettled({ key, value });
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setSettled({ key, error: caught instanceof Error ? caught : new Error(fallbackMessage) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [key, fallbackMessage]);

  if (key === null) {
    return { phase: 'idle' };
  }

  if (settled === null || settled.key !== key) {
    return { phase: 'loading' };
  }

  if ('error' in settled) {
    return {
      phase: 'failed',
      message: settled.error instanceof ApiError ? settled.error.message : fallbackMessage,
      status: settled.error instanceof ApiError ? settled.error.status : null,
    };
  }

  return { phase: 'ready', value: settled.value };
}
