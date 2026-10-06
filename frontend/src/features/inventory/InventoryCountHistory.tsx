import type { InventoryCount } from '../../types/inventory';
import { describeDifference, formatDateTime } from './inventory-count';

interface InventoryCountHistoryProps {
  counts: InventoryCount[];
}

/** Clase del distintivo según la diferencia: faltante, sobrante o sin diferencia. */
function differenceBadge(difference: number): string {
  if (difference < 0) {
    return 'badge badge--error';
  }

  return difference === 0 ? 'badge badge--ok' : 'badge badge--muted';
}

/**
 * Historial de conteos físicos (HU-10). Es de solo lectura a propósito: un
 * conteo confirmado no se edita, así que no hay acciones por fila.
 */
export function InventoryCountHistory({ counts }: InventoryCountHistoryProps) {
  return (
    <section className="card">
      <header className="card__header">
        <h2>Historial de conteos</h2>
        <span className="muted">{counts.length} conteo(s)</span>
      </header>

      {counts.length === 0 ? (
        <p className="muted">Todavía no se ha registrado ningún conteo físico.</p>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>Código</th>
                <th>Producto</th>
                <th className="table__number">Stock del sistema</th>
                <th className="table__number">Contado</th>
                <th className="table__number">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((count) => {
                const difference = describeDifference(count.difference);

                return (
                  <tr key={count.id}>
                    <td>{formatDateTime(count.createdAt)}</td>
                    <td>{count.productCode}</td>
                    <td>{count.productName}</td>
                    <td className="table__number">{count.systemStock}</td>
                    <td className="table__number">{count.countedQuantity}</td>
                    <td className="table__number">
                      <span className={differenceBadge(count.difference)} title={difference.text}>
                        {difference.value}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
