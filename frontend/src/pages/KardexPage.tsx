import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../features/auth/session-context';
import { EntryPanel } from '../features/kardex/EntryPanel';
import { ExitPanel } from '../features/kardex/ExitPanel';
import { isProductId } from '../features/kardex/kardex-format';
import { rememberRecent } from '../features/kardex/kardex-recents';
import { KardexSearch } from '../features/kardex/KardexSearch';
import { MovementsHistory } from '../features/kardex/MovementsHistory';
import { ProductSheet } from '../features/kardex/ProductSheet';
import { RecentMovements } from '../features/kardex/RecentMovements';
import { useKeyedRequest } from '../features/kardex/use-keyed-request';
import { kardexService } from '../services/kardex.service';
import type { KardexAmounts, KardexProduct } from '../types/kardex';

/** Panel abierto bajo la barra de acciones. */
type Panel = 'entry' | 'exit' | null;

/**
 * Movimientos · Kardex (HU-31, HU-38). Siempre con la misma forma:
 *
 * 1. Arriba, el buscador (código, nombre o código de barras, con «Recientes»).
 * 2. La ficha del producto en celdas; sin producto, la misma ficha con «—».
 * 3. El kardex del producto (Todos / Entradas / Salidas, con «Totales») o,
 *    sin producto, los últimos movimientos de todos los productos.
 * 4. La barra de acciones: «+ Registrar ingreso» (con o sin pedido) y
 *    «− Registrar egreso» (salidas que no son ventas). Cada uno abre su panel
 *    debajo, a la vista junto al kardex. Las ventas salen solas desde la caja.
 *
 * Los permisos los vuelve a revisar el servidor: el ingreso pide `purchasing`
 * (como recibir un pedido) y el egreso `inventory.write`.
 *
 * El producto viaja en la dirección (`/movimientos?productId=<uuid>`): se abre desde
 * Inventario con «Ver movimientos» y se puede compartir o recargar.
 */
export function KardexPage() {
  const { can } = useSession();
  const [params, setParams] = useSearchParams();
  const requested = params.get('productId') ?? '';
  const validId = isProductId(requested);
  const [panel, setPanel] = useState<{ productId: string; open: Panel }>({
    productId: requested,
    open: null,
  });
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ productId: string; value: KardexAmounts } | null>(null);

  /** Ficha vuelta a leer tras un ingreso o egreso (stock nuevo), sin recargar la pantalla. */
  const [fresh, setFresh] = useState<KardexProduct | null>(null);

  const product = useKeyedRequest(
    validId ? `product:${requested}` : null,
    () => kardexService.getProduct(requested),
    'No se pudo cargar la ficha del producto.',
  );
  const ready =
    product.phase !== 'ready'
      ? null
      : fresh !== null && fresh.id === product.value.id
        ? fresh
        : product.value;
  // Al cambiar de producto se cierra el panel sin escribir estado en un efecto.
  const open = panel.productId === requested ? panel.open : null;

  // El producto abierto pasa a «Recientes» del buscador (solo en este navegador).
  useEffect(() => {
    if (ready !== null) {
      rememberRecent(ready);
    }
  }, [ready]);

  const receiveSummary = useCallback(
    (value: KardexAmounts) => setSummary({ productId: requested, value }),
    [requested],
  );

  function pick(productId: string): void {
    setNotice(null);
    setParams({ productId });
  }

  function toggle(next: Exclude<Panel, null>): void {
    setNotice(null);
    setPanel({ productId: requested, open: open === next ? null : next });
  }

  function saved(message: string): void {
    setNotice(message);
    setPanel({ productId: requested, open: null });
    setVersion((current) => current + 1);
    // El stock cambió: se vuelve a leer la ficha (si falla, queda la anterior).
    kardexService
      .getProduct(requested)
      .then(setFresh)
      .catch(() => undefined);
  }

  const canEnter = ready !== null && can('purchasing');
  const canExit = ready !== null && can('inventory.write');

  return (
    <>
      <header className="page-header">
        <h1>Movimientos · Kardex</h1>
        <p>Entradas y salidas de cada producto, con el saldo después de cada movimiento.</p>
      </header>

      <div className="kardex-toolbar">
        <KardexSearch onPick={pick} />
        <span className="kardex-toolbar__links">
          {requested === '' ? null : (
            <Link to="/movimientos" onClick={() => setNotice(null)}>
              ← Limpiar y buscar otro
            </Link>
          )}
          <Link to="/inventory" className="button kardex-back">
            ← Volver a Inventario
          </Link>
        </span>
      </div>

      {requested !== '' && !validId ? (
        <p className="alert alert--error" role="alert">
          El producto indicado en la dirección no es válido. Búsquelo arriba.
        </p>
      ) : null}

      {product.phase === 'failed' ? (
        <p className="alert alert--error" role="alert">
          {product.status === 404
            ? 'El producto no existe o ya no está disponible. Busque otro arriba.'
            : product.message}
        </p>
      ) : null}

      {notice === null ? null : (
        <p className="alert alert--success" role="status">
          {notice}
        </p>
      )}

      {product.phase === 'loading' && ready === null ? (
        <p className="card muted" role="status">
          Cargando ficha del producto…
        </p>
      ) : (
        <ProductSheet
          product={ready}
          summary={summary !== null && summary.productId === requested ? summary.value : null}
        />
      )}

      {ready === null ? (
        product.phase === 'loading' ? null : (
          <RecentMovements />
        )
      ) : (
        // La ficha ya se ve: el historial llega aparte y por páginas.
        <MovementsHistory
          productId={ready.id}
          stock={ready.stock}
          version={version}
          onSummary={receiveSummary}
        />
      )}

      <div className="action-bar" role="toolbar" aria-label="Acciones de movimientos">
        <button
          type="button"
          className="action-bar__button action-bar__button--ok"
          disabled={!canEnter}
          aria-pressed={open === 'entry'}
          onClick={() => toggle('entry')}
        >
          + Registrar ingreso
        </button>
        <button
          type="button"
          className="action-bar__button action-bar__button--danger"
          disabled={!canExit}
          aria-pressed={open === 'exit'}
          onClick={() => toggle('exit')}
        >
          − Registrar egreso
        </button>
        <span className="action-bar__status" role="status">
          {ready === null
            ? 'Busque un producto para registrar ingresos o egresos.'
            : 'Las ventas salen solas desde la caja.'}
        </span>
      </div>

      {ready !== null && open === 'entry' ? (
        <EntryPanel key={`entry-${ready.id}`} product={ready} onSaved={saved} />
      ) : null}
      {ready !== null && open === 'exit' ? (
        <ExitPanel key={`exit-${ready.id}`} product={ready} version={version} onSaved={saved} />
      ) : null}
    </>
  );
}
