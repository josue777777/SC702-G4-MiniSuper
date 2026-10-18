import { Link } from 'react-router-dom';

interface StatTileProps {
  label: string;
  value: string;
  detail: string;
  /** Pantalla donde se ve el detalle de este número. */
  to: string;
  /**
   * `alert` solo para números que piden atención (stock bajo, vencidos). El
   * color nunca va solo: lleva también el texto «Requiere atención».
   */
  tone?: 'neutral' | 'alert';
}

/** Tarjeta con un número grande del panel: un solo dato no necesita gráfico. */
export function StatTile({ label, value, detail, to, tone = 'neutral' }: StatTileProps) {
  return (
    <Link to={to} className={tone === 'alert' ? 'stat-tile stat-tile--alert' : 'stat-tile'}>
      <span className="stat-tile__label">{label}</span>
      <strong className="stat-tile__value">{value}</strong>
      <span className="stat-tile__detail">
        {tone === 'alert' ? <span className="stat-tile__flag">⚠ Requiere atención · </span> : null}
        {detail}
      </span>
    </Link>
  );
}
