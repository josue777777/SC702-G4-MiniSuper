import type { ExpirationAlert } from '../../types/inventory';
import { describeExpiration, formatDateOnly, formatDateTime } from './inventory-count';
import { useExpirationReport } from './use-expiration-report';

/** Imprime solo el reporte: marca el `body` y la hoja de estilos oculta el resto. */
function printReport(): void {
  document.body.classList.add('printing-report');
  window.addEventListener('afterprint', () => document.body.classList.remove('printing-report'), {
    once: true,
  });
  window.print();
}

function ExpirationTable({
  title,
  alerts,
  expired,
}: {
  title: string;
  alerts: ExpirationAlert[];
  expired: boolean;
}) {
  return (
    <section>
      <h3>
        {title}{' '}
        <span className={expired ? 'badge badge--error' : 'badge badge--warning'}>
          {alerts.length}
        </span>
      </h3>
      {alerts.length === 0 ? (
        <p className="muted">Ningún producto en esta sección.</p>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th className="table__number">Stock</th>
                <th>Vence</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.productId}>
                  <td>{alert.productCode}</td>
                  <td>{alert.productName}</td>
                  <td className="table__number">{alert.stock}</td>
                  <td>{formatDateOnly(alert.expirationDate)}</td>
                  <td>{describeExpiration(alert.daysLeft)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Reporte de productos vencidos y próximos a vencer (HU-27), con los vencidos
 * separados de los próximos. Se imprime o se guarda como PDF con el diálogo del
 * navegador.
 */
export function ExpirationReport() {
  const { phase, alerts, withDateCount, message, reload } = useExpirationReport();
  const expired = alerts.filter((alert) => alert.status === 'EXPIRED');
  const expiringSoon = alerts.filter((alert) => alert.status === 'EXPIRING_SOON');

  return (
    <section className="card print-area">
      <div className="print-only">
        <h1>Reporte de productos vencidos y por vencer</h1>
        <p>Generado el {formatDateTime(new Date().toISOString())}</p>
      </div>

      <header className="card__header">
        <h2>Vencidos y próximos a vencer</h2>
        <button
          type="button"
          className="button no-print"
          disabled={phase !== 'ready' || alerts.length === 0}
          onClick={printReport}
        >
          Imprimir / Guardar PDF
        </button>
      </header>

      {phase === 'loading' ? <p className="muted">Consultando vencimientos…</p> : null}

      {phase === 'failed' ? (
        <p className="alert alert--error">
          No se pudo generar el reporte: {message}{' '}
          <button type="button" className="button no-print" onClick={() => void reload()}>
            Reintentar
          </button>
        </p>
      ) : null}

      {phase === 'ready' && withDateCount === 0 ? (
        <p className="muted">
          No hay datos disponibles: ningún producto tiene fecha de vencimiento.
        </p>
      ) : null}

      {phase === 'ready' && withDateCount > 0 && alerts.length === 0 ? (
        <p className="muted">Ningún producto está vencido ni vence en los próximos 15 días.</p>
      ) : null}

      {phase === 'ready' && alerts.length > 0 ? (
        <>
          <ExpirationTable title="Vencidos" alerts={expired} expired />
          <ExpirationTable
            title="Próximos a vencer (menos de 15 días)"
            alerts={expiringSoon}
            expired={false}
          />
        </>
      ) : null}
    </section>
  );
}
