import type { PlanRequestStatus } from '../../types/platform';

const LABELS: Record<PlanRequestStatus, { text: string; className: string }> = {
  PENDING: { text: 'Pendiente', className: 'badge badge--warning' },
  APPROVED: { text: 'Aprobada', className: 'badge badge--ok' },
  REJECTED: { text: 'Rechazada', className: 'badge badge--muted' },
};

/** Estado de una solicitud de más usuarios. */
export function RequestStatusBadge({ status }: { status: PlanRequestStatus }) {
  return <span className={LABELS[status].className}>{LABELS[status].text}</span>;
}
