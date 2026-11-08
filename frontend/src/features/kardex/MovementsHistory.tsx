import { useEffect, useState } from 'react';
import { DEFAULT_PAGE_SIZE } from '../../components/use-pagination';
import { kardexService } from '../../services/kardex.service';
import type { KardexAmounts, KardexDirection } from '../../types/kardex';
import { MovementsTable } from './MovementsTable';
import { useKeyedRequest } from './use-keyed-request';

/** Movimientos por página: el mismo estándar de todas las tablas (regla 2). */
const PAGE_SIZE = DEFAULT_PAGE_SIZE;

/** Filtro del historial, con el texto del botón. */
const DIRECTIONS: [KardexDirection, string][] = [
  ['all', 'Todos'],
  ['entries', 'Entradas'],
  ['exits', 'Salidas'],
];

interface MovementsHistoryProps {
  productId: string;
  /** Stock actual: el saldo de la fila «Totales». */
  stock: number;
  /** Cambia cada vez que se registra un ingreso o egreso: vuelve a pedir el historial. */
  version: number;
  /** Entrega el resumen de todo el historial a la ficha («Entró · Salió · N movimientos»). */
  onSummary: (summary: KardexAmounts) => void;
}

/**
 * Kardex del producto (HU-31), del más reciente al más antiguo. Se pide aparte
 * de la ficha y por páginas: un historial largo nunca se baja de golpe y la
 * ficha se ve sin esperarlo.
 *
 * «Todos / Entradas / Salidas» filtra en el servidor (un ajuste cuenta según
 * si subió o bajó el stock). La fila «Totales» suma lo filtrado y cierra con
 * el stock actual. Sin «stock anterior»: es el stock final de la línea de abajo.
 */
export function MovementsHistory({ productId, stock, version, onSummary }: MovementsHistoryProps) {
  const [position, setPosition] = useState({
    productId,
    page: 1,
    attempt: 0,
    direction: 'all' as KardexDirection,
  });
  // Cambiar de producto vuelve a la primera página y a «Todos» sin escribir estado en un efecto.
  const { page, attempt, direction } =
    position.productId === productId
      ? position
      : { page: 1, attempt: 0, direction: 'all' as KardexDirection };

  const history = useKeyedRequest(
    `${productId}:${page}:${attempt}:${direction}:${version}`,
    () => kardexService.listMovements(productId, page, PAGE_SIZE, direction),
    'No se pudo cargar el historial del producto.',
  );

  function goTo(next: number): void {
    setPosition({ productId, page: next, attempt, direction });
  }

  const loaded = history.phase === 'ready' ? history.value : null;

  useEffect(() => {
    if (loaded !== null) {
      onSummary(loaded.summary);
    }
  }, [loaded, onSummary]);

  return (
    <section className="card" aria-label="Historial de movimientos">
      <header className="card__header">
        <h2>Kardex del producto</h2>
        <div className="segmented" role="group" aria-label="Movimientos a mostrar">
          {DIRECTIONS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={
                direction === id ? 'segmented__item segmented__item--active' : 'segmented__item'
              }
              aria-pressed={direction === id}
              onClick={() => setPosition({ productId, page: 1, attempt, direction: id })}
            >
              {label}
            </button>
          ))}
        </div>
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
            onClick={() => setPosition({ productId, page, attempt: attempt + 1, direction })}
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {loaded !== null && loaded.total === 0 ? (
        <p className="muted" role="status">
          {direction === 'all'
            ? 'No hay historial disponible para este producto.'
            : `No hay ${direction === 'entries' ? 'entradas' : 'salidas'} de este producto.`}
        </p>
      ) : null}

      {loaded !== null && loaded.items.length > 0 ? (
        <>
          <MovementsTable
            label="Movimientos del producto"
            items={loaded.items}
            totals={{ amounts: loaded.totals, stock }}
          />

          <nav className="kardex-pager" aria-label="Páginas del historial">
            <span className="muted">
              {loaded.total.toLocaleString('es-CR')}{' '}
              {loaded.total === 1 ? 'movimiento' : 'movimientos'} · Página {loaded.page} de{' '}
              {loaded.totalPages}
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
