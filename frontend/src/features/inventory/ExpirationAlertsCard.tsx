import { ExpirationList } from './ExpirationList';
import { useExpirationAlerts } from './use-expiration-alerts';

/** Tarjeta del panel principal con los vencidos y próximos a vencer (HU-09). */
export function ExpirationAlertsCard() {
  const { phase, alerts, message } = useExpirationAlerts();

  if (phase === 'loading') {
    return <p className="card muted">Consultando vencimientos…</p>;
  }

  if (phase === 'failed' && alerts.length === 0) {
    return (
      <p className="card alert alert--error">
        No se pudieron consultar los vencimientos: {message}
      </p>
    );
  }

  return <ExpirationList alerts={alerts} title="Vencimientos" />;
}
