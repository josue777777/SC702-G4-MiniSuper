import { useState } from 'react';
import { DEFAULT_PAGE_SIZE } from '../../components/use-pagination';
import { kardexService } from '../../services/kardex.service';
import type { KardexRecentMovement } from '../../types/kardex';
import { FlowAmount } from './FlowAmount';
import { MovementsTable } from './MovementsTable';
import { useKeyedRequest } from './use-keyed-request';

/** El código y el nombre de la línea (la vista general muestra todos los productos). */
function productOf(movement: KardexRecentMovement) {
  return movement.product;
}

/**
 * Vista general de Movimientos, mientras no se elige un producto: lo que entró
 * y salió hoy (en el encabezado) y los últimos movimientos de TODOS los productos,
 * del más reciente al más antiguo, de 15 en 15 (regla 2). Tocar el código de
 * una línea abre el kardex de ese producto. Así la pantalla nunca arranca
 * vacía y lo último que pasó en el almacén se ve de un vistazo.
 */
export function RecentMovements() {
  const [position, setPosition] = useState({ page: 1, attempt: 0 });
  const { page, attempt } = position;
  const recent = useKeyedRequest(
    `recent:${page}:${attempt}`,
    () => kardexService.listRecentMovements(page, DEFAULT_PAGE_SIZE),
    'No se pudieron cargar los movimientos recientes.',
  );
  const loaded = recent.phase === 'ready' ? recent.value : null;

  return (
    <section className="card" aria-label="Movimientos recientes">
      <header className="card__header">
        <h2>Movimientos recientes · todos los productos</h2>
        {loaded === null ? null : (
          <span className="card__header-end kardex-today" aria-label="Hoy">
            Hoy: entran <FlowAmount value={loaded.today.entries} direction="in" /> · salen{' '}
            <FlowAmount value={loaded.today.exits} direction="out" /> ·{' '}
            <span className="muted">
              {loaded.today.count.toLocaleString('es-CR')}{' '}
              {loaded.today.count === 1 ? 'movimiento' : 'movimientos'}
            </span>
          </span>
        )}
      </header>

      {recent.phase === 'loading' ? (
        <p className="muted" role="status">
          Cargando movimientos recientes…
        </p>
      ) : null}

      {recent.phase === 'failed' ? (
        <div className="alert alert--error" role="alert">
          <span>{recent.message}</span>
          <button
            type="button"
            className="button"
            onClick={() => setPosition({ page, attempt: attempt + 1 })}
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {loaded !== null && loaded.total === 0 ? (
        <p className="muted" role="status">
          Todavía no hay movimientos. Aparecen aquí con la primera venta, entrada o conteo.
        </p>
      ) : null}

      {loaded !== null && loaded.items.length > 0 ? (
        <>
          <MovementsTable
            label="Movimientos recientes de todos los productos"
            items={loaded.items}
            productOf={productOf}
          />
          <nav className="kardex-pager" aria-label="Páginas de movimientos recientes">
            <span className="muted">
              Página {loaded.page} de {loaded.totalPages}
            </span>
            <button
              type="button"
              className="button"
              disabled={loaded.page <= 1}
              onClick={() => setPosition({ page: loaded.page - 1, attempt })}
            >
              Anterior
            </button>
            <button
              type="button"
              className="button"
              disabled={loaded.page >= loaded.totalPages}
              onClick={() => setPosition({ page: loaded.page + 1, attempt })}
            >
              Siguiente
            </button>
          </nav>
        </>
      ) : null}
    </section>
  );
}
