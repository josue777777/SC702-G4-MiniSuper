import { formatMoney } from '../products/money';
import type { BarDatum } from './dashboard-metrics';

interface BarListProps {
  title: string;
  /** Qué mide el gráfico, debajo del título. */
  subtitle: string;
  data: BarDatum[];
  emptyText: string;
}

/**
 * Gráfico de barras horizontales para comparar montos (una sola serie).
 *
 * Barras y no donas: el ojo compara largos mucho mejor que ángulos. Cada fila
 * trae su nombre, su monto y su porcentaje como texto, así que el gráfico se
 * puede leer sin distinguir colores y funciona también como tabla.
 */
export function BarList({ title, subtitle, data, emptyText }: BarListProps) {
  const max = Math.max(0, ...data.map((datum) => Number(datum.value)));

  return (
    <section className="card chart-card">
      <header className="chart-card__header">
        <h2>{title}</h2>
        <p className="muted">{subtitle}</p>
      </header>

      {data.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <ul className="bar-list" aria-label={title}>
          {data.map((datum) => {
            const width = max === 0 ? 0 : (Number(datum.value) / max) * 100;
            const text = `${datum.label}: ${formatMoney(datum.value)} (${datum.share} % del total)`;

            return (
              <li key={datum.key} className="bar-list__row" title={text}>
                <span className="bar-list__label">{datum.label}</span>
                <span className="bar-list__value">
                  {formatMoney(datum.value)}
                  <small> · {datum.share} %</small>
                </span>
                {/* Todas las barras parten de la misma línea y comparten la escala. */}
                <span className="bar-list__track" aria-hidden="true">
                  <span className="bar-list__bar" style={{ width: `${Math.max(width, 1)}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
