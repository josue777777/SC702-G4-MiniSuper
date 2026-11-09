import { useState } from 'react';
import { DEFAULT_PAGE_SIZE } from '../../components/use-pagination';
import { kardexService } from '../../services/kardex.service';
import type { KardexRecentMovement } from '../../types/kardex';
import { FlowAmount } from './FlowAmount';
import { MovementsPager } from './MovementsPager';
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
 * vacía y lo último que pasó en el almacén se ve de un vistazo. Como el
 * historial de un producto, ocupa siempre el espacio de una página y la
 * paginación no cambia de lugar.
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
  // Mientras llega otra página, se sigue viendo la anterior (atenuada): la tabla no salta.
  const shown = loaded ?? (recent.phase === 'loading' ? (recent.previous?.value ?? null) : null);
  const busy = recent.phase === 'loading';

  return (
    <section className="card" aria-label="Movimientos recientes" aria-busy={busy}>
      <header className="card__header">
        <h2>Movimientos recientes · todos los productos</h2>
        {shown === null ? null : (
          <span className="card__header-end kardex-today" aria-label="Hoy">
            Hoy: entran <FlowAmount value={shown.today.entries} direction="in" signed /> · salen{' '}
            <FlowAmount value={shown.today.exits} direction="out" signed /> ·{' '}
            <span className="muted">
              {shown.today.count.toLocaleString('es-CR')}{' '}
              {shown.today.count === 1 ? 'movimiento' : 'movimientos'}
            </span>
          </span>
        )}
      </header>

      <div
        className={
          busy && shown !== null ? 'kardex-history kardex-history--busy' : 'kardex-history'
        }
      >
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
        ) : shown === null ? (
          <p className="muted" role="status">
            Cargando movimientos recientes…
          </p>
        ) : shown.total === 0 ? (
          <p className="muted" role="status">
            Todavía no hay movimientos. Aparecen aquí con la primera venta, entrada o conteo.
          </p>
        ) : (
          <MovementsTable
            label="Movimientos recientes de todos los productos"
            items={shown.items}
            productOf={productOf}
          />
        )}
      </div>

      <MovementsPager
        label="Páginas de movimientos recientes"
        page={shown === null ? null : shown.page}
        totalPages={shown?.totalPages ?? 1}
        total={shown?.total ?? null}
        onPage={(next) => setPosition({ page: next, attempt })}
      />
    </section>
  );
}
