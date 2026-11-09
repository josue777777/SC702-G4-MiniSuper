import { formatMoney } from '../products/money';
import type { ReportChart } from '../../types/reports';

interface ReportChartViewProps {
  chart: ReportChart;
}

function format(value: number, unit: ReportChart['unit']): string {
  if (unit === 'money') {
    return formatMoney(value.toFixed(2));
  }

  return unit === 'units' ? `${value} u.` : `${value} producto(s)`;
}

/** Montos cortos para los ejes: ₡12 k, ₡1,2 M. */
function short(value: number, unit: ReportChart['unit']): string {
  const prefix = unit === 'money' ? '₡' : '';

  if (Math.abs(value) >= 1_000_000) {
    return `${prefix}${(value / 1_000_000).toFixed(1).replace('.', ',')} M`;
  }

  if (Math.abs(value) >= 1_000) {
    return `${prefix}${Math.round(value / 1_000)} k`;
  }

  return `${prefix}${Math.round(value)}`;
}

/**
 * Un gráfico de reporte, de una sola serie y un solo color (docs/PANTALLAS.md):
 *
 * - `bars`: barras horizontales para comparar nombres. Cada barra trae su
 *   etiqueta y su valor escritos: se lee sin depender del color.
 * - `columns`: columnas por día para ver la evolución en el tiempo, con una
 *   línea de base y tres guías tenues.
 *
 * Al pasar el cursor, cada marca muestra su valor exacto (atributo `title`).
 * El mismo dato está completo en «Ver detalle», el PDF y el Excel.
 */
export function ReportChartView({ chart }: ReportChartViewProps) {
  const total = chart.data.reduce((sum, datum) => sum + datum.value, 0);

  return (
    <figure className="report-chart" aria-label={chart.title}>
      <figcaption>
        <strong>{chart.title}</strong>
        <span className="muted">{chart.subtitle}</span>
      </figcaption>

      {chart.data.length === 0 ? (
        <p className="muted">Sin datos para graficar.</p>
      ) : chart.form === 'bars' ? (
        <Bars chart={chart} total={total} />
      ) : (
        <Columns chart={chart} />
      )}
    </figure>
  );
}

function Bars({ chart, total }: { chart: ReportChart; total: number }) {
  const max = Math.max(0, ...chart.data.map((datum) => datum.value));

  return (
    <ul className="bar-list">
      {chart.data.map((datum) => {
        const width = max <= 0 ? 0 : (Math.max(datum.value, 0) / max) * 100;
        const share = total === 0 ? 0 : Math.round((datum.value / total) * 100);
        const text = `${datum.label}: ${format(datum.value, chart.unit)} (${share} %)`;

        return (
          <li key={datum.key} className="bar-list__row" title={text}>
            <span className="bar-list__label">{datum.label}</span>
            <span className="bar-list__value">
              {format(datum.value, chart.unit)}
              <small> · {share} %</small>
            </span>
            <span className="bar-list__track" aria-hidden="true">
              <span className="bar-list__bar" style={{ width: `${Math.max(width, 1)}%` }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const WIDTH = 600;
const HEIGHT = 200;
const PAD = { top: 10, right: 8, bottom: 26, left: 48 };

function Columns({ chart }: { chart: ReportChart }) {
  const max = Math.max(1, ...chart.data.map((datum) => datum.value));
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotWidth / chart.data.length;
  const barWidth = Math.min(36, Math.max(4, slot - 6));
  // Con muchos días, solo algunas etiquetas para que no se encimen.
  const labelEvery = Math.ceil(chart.data.length / 8);
  const y = (value: number) => PAD.top + plotHeight - (Math.max(value, 0) / max) * plotHeight;

  return (
    <svg
      className="report-columns"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`${chart.title}: ${chart.data
        .map((datum) => `${datum.label} ${format(datum.value, chart.unit)}`)
        .join('; ')}`}
    >
      {[0.5, 1].map((step) => (
        <g key={step}>
          <line
            className="report-columns__grid"
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={y(max * step)}
            y2={y(max * step)}
          />
          <text
            className="report-columns__axis"
            x={PAD.left - 6}
            y={y(max * step) + 4}
            textAnchor="end"
          >
            {short(max * step, chart.unit)}
          </text>
        </g>
      ))}
      <line
        className="report-columns__base"
        x1={PAD.left}
        x2={WIDTH - PAD.right}
        y1={y(0)}
        y2={y(0)}
      />

      {chart.data.map((datum, index) => {
        const x = PAD.left + slot * index + (slot - barWidth) / 2;
        const top = y(datum.value);
        const height = Math.max(y(0) - top, 1);

        return (
          <g key={datum.key} className="report-columns__mark">
            <title>{`${datum.label}: ${format(datum.value, chart.unit)}`}</title>
            {/* Zona de toque más grande que la barra. */}
            <rect
              x={PAD.left + slot * index}
              y={PAD.top}
              width={slot}
              height={plotHeight}
              fill="transparent"
            />
            <path
              className="report-columns__bar"
              d={`M${x},${y(0)} V${top + 4} Q${x},${top} ${x + 4},${top} H${x + barWidth - 4} Q${x + barWidth},${top} ${x + barWidth},${top + 4} V${y(0)} Z`}
              style={{ display: height < 5 ? 'none' : undefined }}
            />
            {height < 5 ? (
              <rect
                className="report-columns__bar"
                x={x}
                y={y(0) - height}
                width={barWidth}
                height={height}
              />
            ) : null}
            {index % labelEvery === 0 ? (
              <text
                className="report-columns__axis"
                x={x + barWidth / 2}
                y={HEIGHT - 8}
                textAnchor="middle"
              >
                {datum.label.slice(5).replace('-', '/')}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
