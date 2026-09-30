import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../services/api-client';
import { healthService } from '../services/health.service';
import type { DatabaseStatus, ServiceStatus } from '../types/api';

type Phase = 'loading' | 'ready' | 'failed';

interface CardState {
  phase: Phase;
  service?: ServiceStatus;
  database?: DatabaseStatus;
  message?: string;
}

/**
 * Rebanada vertical del proyecto: React → service → api-client → Express →
 * Prisma → PostgreSQL, de punta a punta.
 *
 * Sirve para comprobar en pantalla que el cableado funciona antes de escribir
 * la primera historia de usuario, y queda como referencia del patrón:
 * el componente nunca usa `fetch`, siempre pasa por `healthService`.
 */
export function BackendStatusCard() {
  const [state, setState] = useState<CardState>({ phase: 'loading' });

  const load = useCallback(async () => {
    setState({ phase: 'loading' });

    try {
      const service = await healthService.getServiceStatus();
      // La base puede estar caída (503) sin que el backend deje de responder.
      const database = await healthService.getDatabaseStatus().catch((error: ApiError) => ({
        connected: false,
        latencyMs: 0,
        error: error.message,
      }));

      setState({ phase: 'ready', service, database });
    } catch (error) {
      setState({
        phase: 'failed',
        message:
          error instanceof ApiError
            ? error.message
            : 'Error inesperado al consultar el estado del sistema.',
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.phase === 'loading') {
    return <p className="card muted">Comprobando el servidor…</p>;
  }

  if (state.phase === 'failed') {
    return (
      <section className="card">
        <header className="card__header">
          <h2>Estado del sistema</h2>
          <button type="button" className="button" onClick={() => void load()}>
            Reintentar
          </button>
        </header>
        <p className="badge badge--error">Backend no accesible</p>
        <p className="muted">{state.message}</p>
      </section>
    );
  }

  const { service, database } = state;

  return (
    <section className="card">
      <header className="card__header">
        <h2>Estado del sistema</h2>
        <button type="button" className="button" onClick={() => void load()}>
          Actualizar
        </button>
      </header>

      <ul className="status-list">
        <li>
          <span>API</span>
          <span className="badge badge--ok">en línea</span>
          <small>
            {service?.service} · {service?.environment} · uptime {service?.uptimeSeconds}s
          </small>
        </li>
        <li>
          <span>PostgreSQL</span>
          {database?.connected ? (
            <span className="badge badge--ok">conectada</span>
          ) : (
            <span className="badge badge--error">no disponible</span>
          )}
          <small>
            {database?.connected
              ? `latencia ${database.latencyMs} ms`
              : (database?.error ?? 'sin respuesta')}
          </small>
        </li>
      </ul>

      <p className="muted hint">
        Si PostgreSQL aparece «no disponible», levante la base con <code>npm run db:up</code> y
        aplique las migraciones con <code>npm run db:migrate</code>.
      </p>
    </section>
  );
}
