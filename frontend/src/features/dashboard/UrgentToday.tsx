import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../../components/Modal';
import { ExpirationAlertsCard } from '../inventory/ExpirationAlertsCard';
import { LowStockAlertsCard } from '../inventory/LowStockAlertsCard';
import {
  SEVERITY_LABELS,
  VISIBLE_URGENCIES,
  type PendingReceipt,
  type Urgency,
} from './dashboard-urgencies';

interface UrgentTodayProps {
  /** `null` mientras carga la primera vez. */
  urgencies: Urgency[] | null;
  /** Acción instantánea: carga las facturas; devuelve el error o `null`. */
  onLoadReceipts: (receipts: PendingReceipt[]) => Promise<string | null>;
}

const BADGES: Record<Urgency['severity'], string> = {
  critical: 'badge badge--error',
  warning: 'badge badge--warning',
  info: 'badge badge--muted',
};

/**
 * «Lo urgente hoy»: solo las tres urgencias más graves, cada una con su acción
 * a la mano (ver la lista en una ventana, o cargar una factura sin salir del
 * panel). Lo demás queda tras «Ver todo». Cuando no hay nada pendiente, lo dice
 * con un mensaje claro: el panel nunca se queda en blanco.
 *
 * Las alertas de stock bajo (HU-08) y de vencimientos (HU-09) siguen en el
 * panel: son urgencias, con los nombres de los productos y su lista completa.
 */
export function UrgentToday({ urgencies, onLoadReceipts }: UrgentTodayProps) {
  const [open, setOpen] = useState<'all' | 'low-stock' | 'expirations' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(urgency: Urgency): Promise<void> {
    const action = urgency.action;

    if (action.kind === 'low-stock' || action.kind === 'expirations') {
      setOpen(action.kind);
      return;
    }

    if (action.kind === 'load-receipts') {
      setBusy(urgency.id);
      setError(await onLoadReceipts(action.receipts));
      setBusy(null);
    }
  }

  function card(urgency: Urgency) {
    const action = urgency.action;

    return (
      <article
        key={urgency.id}
        className={`card bento__cell bento__cell--${urgency.severity}`}
        aria-label={urgency.title}
      >
        <header className="card__header">
          <h3>{urgency.title}</h3>
          <span className={BADGES[urgency.severity]}>{SEVERITY_LABELS[urgency.severity]}</span>
        </header>
        <p className="muted">{urgency.detail}</p>
        <div className="form__actions">
          {action.kind === 'link' ? (
            <Link className="button" to={action.to}>
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              className={action.kind === 'load-receipts' ? 'button button--primary' : 'button'}
              disabled={busy !== null}
              onClick={() => void act(urgency)}
            >
              {busy === urgency.id ? 'Cargando…' : action.label}
            </button>
          )}
        </div>
      </article>
    );
  }

  const visible = urgencies?.slice(0, VISIBLE_URGENCIES) ?? [];
  const hidden = (urgencies?.length ?? 0) - visible.length;

  return (
    <section aria-labelledby="urgent-title">
      <header className="card__header">
        <h2 id="urgent-title">Lo urgente hoy</h2>
        {hidden > 0 ? (
          <button type="button" className="button" onClick={() => setOpen('all')}>
            Ver todo ({urgencies?.length})
          </button>
        ) : null}
      </header>

      {error === null ? null : (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}

      {urgencies === null ? (
        <p className="card muted" role="status">
          Revisando lo pendiente…
        </p>
      ) : urgencies.length === 0 ? (
        <p className="card bento__empty" role="status">
          <span className="bento__empty-icon" aria-hidden="true">
            ✓
          </span>
          <strong>¡Está al día!</strong> No hay tareas pendientes por ahora: sin productos vencidos,
          sin stock bajo y sin mercadería por cargar.
        </p>
      ) : (
        <div className="stat-grid bento">{visible.map(card)}</div>
      )}

      {open === 'all' ? (
        <Modal title="Todo lo pendiente" size="wide" onClose={() => setOpen(null)}>
          <div className="stat-grid">{urgencies?.map(card)}</div>
        </Modal>
      ) : null}
      {open === 'low-stock' ? (
        <Modal title="Stock bajo" size="wide" onClose={() => setOpen(null)}>
          <LowStockAlertsCard />
        </Modal>
      ) : null}
      {open === 'expirations' ? (
        <Modal title="Vencidos y por vencer" size="wide" onClose={() => setOpen(null)}>
          <ExpirationAlertsCard />
        </Modal>
      ) : null}
    </section>
  );
}
