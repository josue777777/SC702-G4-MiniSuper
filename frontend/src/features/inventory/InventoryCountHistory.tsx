import type { InventoryCount } from '../../types/inventory';
import { Pagination } from '../../components/Pagination';
import { usePagination } from '../../components/use-pagination';
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
 *
 * Comparte la ventana con el formulario de conteo, así que va plegado: lo
 * principal es contar, y el historial se abre si se quiere revisar.
 */
export function InventoryCountHistory({ counts }: InventoryCountHistoryProps) {
  const pages = usePagination(counts, null);

  return (
    <section className="card">
      <details className="disclosure">
        <summary>Historial de conteos ({counts.length})</summary>

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
                {pages.pageItems.map((count) => {
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
        <Pagination {...pages} itemLabel="conteos" onPage={pages.setPage} />
      </details>
    </section>
  );
}
