import { useState } from 'react';
import type { ExpirationAlert } from '../../types/inventory';
import { describeExpiration, formatDateOnly } from './inventory-count';

type Filter = 'ALL' | ExpirationAlert['status'];

interface ExpirationListProps {
  alerts: ExpirationAlert[];
  /** En el panel principal se muestra sin filtro; en Inventario, con filtro. */
  showFilter?: boolean;
  title?: string;
}

/**
 * Productos vencidos y próximos a vencer (HU-09). La marca "próximo a vencer"
 * aparece cuando faltan menos de 15 días. Es una vista filtrada en pantalla; el
 * reporte exportable corresponde a HU-27.
 */
export function ExpirationList({
  alerts,
  showFilter = false,
  title = 'Vencidos y por vencer',
}: ExpirationListProps) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const visible = filter === 'ALL' ? alerts : alerts.filter((alert) => alert.status === filter);
  const expiredCount = alerts.filter((alert) => alert.status === 'EXPIRED').length;

  return (
    <section className="card">
      <header className="card__header">
        <h2>{title}</h2>
        {alerts.length > 0 ? (
          <span className={expiredCount > 0 ? 'badge badge--error' : 'badge badge--warning'}>
            {alerts.length} producto(s)
          </span>
        ) : null}
      </header>

      {showFilter && alerts.length > 0 ? (
        <div className="toolbar">
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
