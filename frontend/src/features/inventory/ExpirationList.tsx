import { useState } from 'react';
import type { ExpirationAlert } from '../../types/inventory';
import { describeExpiration, formatDateOnly, formatDateTime } from './inventory-count';

type Filter = 'ALL' | ExpirationAlert['status'];

interface ExpirationListProps {
  alerts: ExpirationAlert[];
  /**
   * En Inventario se muestra con filtro y con el botón «Imprimir reporte»
   * (HU-09); en el panel principal, solo la lista.
   */
  showFilter?: boolean;
  title?: string;
}

/**
 * Productos vencidos y próximos a vencer (HU-09). La marca "próximo a vencer"
 * aparece cuando faltan menos de 15 días.
 *
 * «Imprimir reporte» genera el reporte de HU-09 con el diálogo de impresión del
 * navegador (que también permite guardarlo como PDF), con el filtro elegido. El
 * reporte exportable general de inventario es otra historia (HU-27).
 */
const FILTER_LABELS: Record<Filter, string> = {
  ALL: 'Vencidos y próximos a vencer',
  EXPIRED: 'Solo vencidos',
  EXPIRING_SOON: 'Solo próximos a vencer',
};

/** Imprime solo el reporte: marca el `body` y la hoja de estilos oculta el resto. */
function printReport(): void {
  document.body.classList.add('printing-report');
  window.addEventListener('afterprint', () => document.body.classList.remove('printing-report'), {
    once: true,
  });
  window.print();
}

export function ExpirationList({
  alerts,
  showFilter = false,
  title = 'Vencidos y por vencer',
}: ExpirationListProps) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const visible = filter === 'ALL' ? alerts : alerts.filter((alert) => alert.status === filter);
  const expiredCount = alerts.filter((alert) => alert.status === 'EXPIRED').length;

  return (
    <section className={showFilter ? 'card print-area' : 'card'}>
      {showFilter ? (
        <div className="print-only">
          <h1>Reporte de productos vencidos y por vencer</h1>
          <p>
            {FILTER_LABELS[filter]} · Generado el {formatDateTime(new Date().toISOString())}
          </p>
        </div>
      ) : null}

      <header className="card__header">
        <h2>{title}</h2>
        {alerts.length > 0 ? (
          <span className={expiredCount > 0 ? 'badge badge--error' : 'badge badge--warning'}>
            {alerts.length} producto(s)
          </span>
        ) : null}
      </header>

      {showFilter && alerts.length > 0 ? (
        <div className="toolbar no-print">
          <label htmlFor="expiration-filter" className="muted">
            Mostrar:{' '}
          </label>
          <select
            id="expiration-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value as Filter)}
          >
            <option value="ALL">Todos</option>
            <option value="EXPIRED">Vencidos</option>
            <option value="EXPIRING_SOON">Próximos a vencer</option>
          </select>
          <button
            type="button"
            className="button"
            disabled={visible.length === 0}
            onClick={printReport}
          >
            Imprimir reporte
          </button>
        </div>
      ) : null}

      {alerts.length === 0 ? (
        <p className="muted">Ningún producto está vencido ni vence en los próximos 15 días.</p>
      ) : visible.length === 0 ? (
        <p className="muted">No hay productos en este filtro.</p>
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
              {visible.map((alert) => (
                <tr key={alert.productId}>
                  <td>{alert.productCode}</td>
                  <td>{alert.productName}</td>
                  <td className="table__number">{alert.stock}</td>
                  <td>{formatDateOnly(alert.expirationDate)}</td>
                  <td>
                    <span
                      className={
                        alert.status === 'EXPIRED' ? 'badge badge--error' : 'badge badge--warning'
                      }
                    >
                      {describeExpiration(alert.daysLeft)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
