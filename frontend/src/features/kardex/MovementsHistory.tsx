import { useEffect, useState } from 'react';
import { DEFAULT_PAGE_SIZE } from '../../components/use-pagination';
import { kardexService } from '../../services/kardex.service';
import type { KardexAmounts, KardexDirection } from '../../types/kardex';
import { MovementsPager } from './MovementsPager';
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
  /** Cambia cada vez que se registra un ingreso o egreso: vuelve a pedir el historial. */
  version: number;
  /** Entrega a la ficha lo de hoy de este producto («Entró · Salió · N movs.»). */
  onToday: (today: KardexAmounts) => void;
}

/**
 * Historial de movimientos del producto (HU-31), del más reciente al más
 * antiguo, por páginas de 15. Sin fila de totales: el historial completo ya
 * está en la tabla, lo de hoy en la ficha y los totales en Reportes.
 *
 * La tabla no se mueve: su espacio es siempre el de una página completa, la
 * paginación está siempre en el mismo lugar y, mientras llega otra página u
 * otro filtro, se sigue viendo la anterior atenuada (en vez de un «Cargando…»
 * que empuja todo). «Todos / Entradas / Salidas» filtra en el servidor.
 */
export function MovementsHistory({ productId, version, onToday }: MovementsHistoryProps) {
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
  const loaded = history.phase === 'ready' ? history.value : null;
  // Mientras llega lo nuevo, lo anterior del MISMO producto (nunca el de otro).
  const shown =
    loaded ??
    (history.phase === 'loading' && history.previous?.key.startsWith(`${productId}:`) === true
      ? history.previous.value
      : null);
  const busy = history.phase === 'loading';

  useEffect(() => {
    if (loaded !== null) {
      onToday(loaded.today);
    }
  }, [loaded, onToday]);

  return (
    <section className="card" aria-label="Historial de movimientos" aria-busy={busy}>
      <header className="card__header">
        <h2>Historial de movimientos</h2>
        <div className="segmented card__header-end" role="group" aria-label="Movimientos a mostrar">
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

      <div
        className={
          busy && shown !== null ? 'kardex-history kardex-history--busy' : 'kardex-history'
        }
      >
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
        ) : shown === null ? (
          <p className="muted" role="status">
            Cargando historial…
          </p>
        ) : shown.total === 0 ? (
          <p className="muted" role="status">
            {direction === 'all'
              ? 'No hay historial disponible para este producto.'
              : `No hay ${direction === 'entries' ? 'entradas' : 'salidas'} de este producto.`}
          </p>
        ) : (
          <MovementsTable label="Movimientos del producto" items={shown.items} />
        )}
      </div>

      <MovementsPager
        label="Páginas del historial"
        page={shown === null ? null : shown.page}
        totalPages={shown?.totalPages ?? 1}
        total={shown?.total ?? null}
        onPage={(next) => setPosition({ productId, page: next, attempt, direction })}
      />
    </section>
  );
}
