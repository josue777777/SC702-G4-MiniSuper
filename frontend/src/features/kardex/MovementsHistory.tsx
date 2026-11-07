import { useState } from 'react';
import { DEFAULT_PAGE_SIZE } from '../../components/use-pagination';
import { kardexService } from '../../services/kardex.service';
import { formatMovementDate, formatQuantity, formatReference } from './kardex-format';
import { useKeyedRequest } from './use-keyed-request';

/** Movimientos por página: el mismo estándar de todas las tablas (regla 2). */
const PAGE_SIZE = DEFAULT_PAGE_SIZE;

/**
 * Historial de entradas y salidas de un producto (HU-31), del más reciente al más
 * antiguo. Se pide aparte de la ficha y por páginas: un historial largo nunca se
 * baja de golpe y la ficha se ve sin esperarlo.
 */
export function MovementsHistory({ productId }: { productId: string }) {
  const [position, setPosition] = useState({ productId, page: 1, attempt: 0 });
  // Cambiar de producto vuelve a la primera página sin escribir estado en un efecto.
  const { page, attempt } = position.productId === productId ? position : { page: 1, attempt: 0 };

  const history = useKeyedRequest(
    `${productId}:${page}:${attempt}`,
    () => kardexService.listMovements(productId, page, PAGE_SIZE),
    'No se pudo cargar el historial del producto.',
  );

  function goTo(next: number): void {
    setPosition({ productId, page: next, attempt });
  }

  const loaded = history.phase === 'ready' ? history.value : null;

  return (
    <section className="card" aria-label="Historial de movimientos">
      <header className="card__header">
        <h2>Historial de movimientos</h2>
        {loaded === null ? null : (
          <span className="card__header-end muted">
            {loaded.total.toLocaleString('es-CR')}{' '}
            {loaded.total === 1 ? 'movimiento' : 'movimientos'}
          </span>
        )}
      </header>

      {history.phase === 'loading' ? (
        <p className="muted" role="status">
          Cargando historial…
        </p>
      ) : null}

      {history.phase === 'failed' ? (
        <div className="alert alert--error" role="alert">
          <span>{history.message}</span>
          <button
            type="button"
            className="button"
            onClick={() => setPosition({ productId, page, attempt: attempt + 1 })}
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {loaded !== null && loaded.total === 0 ? (
        <p className="muted" role="status">
          No hay historial disponible para este producto.
        </p>
      ) : null}

      {loaded !== null && loaded.items.length > 0 ? (
        <>
          <div className="table-wrapper">
            <table className="table" aria-label="Movimientos del producto">
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Concepto</th>
                  <th>Documento</th>
                  <th className="table__number">Entrada</th>
                  <th className="table__number">Salida</th>
                  <th className="table__number">Stock anterior</th>
                  <th className="table__number">Stock final</th>
                </tr>
              </thead>
              <tbody>
                {loaded.items.map((movement) => (
                  <tr key={movement.id}>
                    <td>{formatMovementDate(movement.createdAt)}</td>
                    <td>{movement.concept}</td>
                    <td>{formatReference(movement.reference)}</td>
                    <td className="table__number">{formatQuantity(movement.entry)}</td>
                    <td className="table__number">{formatQuantity(movement.exit)}</td>
                    <td className="table__number">
                      {movement.stockBefore.toLocaleString('es-CR')}
                    </td>
                    <td className="table__number">{movement.stockAfter.toLocaleString('es-CR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav className="kardex-pager" aria-label="Páginas del historial">
            <span className="muted">
              Página {loaded.page} de {loaded.totalPages}
            </span>
            <button
              type="button"
              className="button"
              disabled={loaded.page <= 1}
              onClick={() => goTo(loaded.page - 1)}
            >
              Anterior
            </button>
            <button
              type="button"
              className="button"
              disabled={loaded.page >= loaded.totalPages}
              onClick={() => goTo(loaded.page + 1)}
            >
              Siguiente
            </button>
          </nav>
        </>
      ) : null}
    </section>
  );
}
