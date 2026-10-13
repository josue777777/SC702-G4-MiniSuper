import { Link } from 'react-router-dom';
import { useLowStockAlerts } from './use-low-stock-alerts';

/**
 * Tarjeta de alertas de stock bajo del panel principal (HU-08).
 *
 * Solo muestra productos activos con un mínimo definido y stock igual o menor a
 * ese mínimo. Cuando se repone el stock, la siguiente consulta automática ya no
 * lo trae y la alerta desaparece.
 */
export function LowStockAlertsCard() {
  const { phase, alerts, message, reload } = useLowStockAlerts();

  return (
    <section className="card">
      <header className="card__header">
        <h2>Stock bajo</h2>
        {phase === 'ready' && alerts.length > 0 ? (
          <span className="badge badge--error">{alerts.length} producto(s)</span>
        ) : null}
      </header>

      {phase === 'loading' ? <p className="muted">Consultando el stock…</p> : null}

      {phase === 'failed' ? (
        <p className="alert alert--error">
          No se pudieron consultar las alertas: {message}
          <button type="button" className="button" onClick={() => void reload()}>
            Reintentar
          </button>
        </p>
      ) : null}

      {phase === 'ready' && alerts.length === 0 ? (
        <p className="muted">Ningún producto está en su mínimo de stock.</p>
      ) : null}

      {alerts.length > 0 ? (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th className="table__number">Stock</th>
                <th className="table__number">Mínimo</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.productId}>
                  <td>{alert.productCode}</td>
                  <td>{alert.productName}</td>
                  <td className="table__number">
                    <span className="badge badge--error">{alert.stock}</span>
                  </td>
                  <td className="table__number">{alert.minStock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="muted hint">
        Se actualiza sola. Para reponer, registre un conteo en{' '}
        <Link to="/inventory">Inventario</Link> o edite el producto.
      </p>
    </section>
  );
}
