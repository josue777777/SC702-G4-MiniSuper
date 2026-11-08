import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../features/auth/session-context';
import { EntryModal } from '../features/kardex/EntryModal';
import { ExitModal } from '../features/kardex/ExitModal';
import { isProductId } from '../features/kardex/kardex-format';
import { rememberRecent } from '../features/kardex/kardex-recents';
import { KardexSearch } from '../features/kardex/KardexSearch';
import { MovementsHistory } from '../features/kardex/MovementsHistory';
import { OrderLoadModal } from '../features/kardex/OrderLoadModal';
import { ProductSheet } from '../features/kardex/ProductSheet';
import { RecentMovements } from '../features/kardex/RecentMovements';
import { useKeyedRequest } from '../features/kardex/use-keyed-request';
import { kardexService } from '../services/kardex.service';
import type { KardexAmounts, KardexProduct } from '../types/kardex';

/** Ventana abierta: ingreso o egreso de UN producto, o la carga de un pedido completo. */
type Dialog = 'entry' | 'exit' | 'order' | null;

/**
 * Movimientos (HU-31, HU-38): entradas y salidas del inventario. Siempre con
 * la misma forma, con las piezas del resto del sistema:
 *
 * 1. Encabezado y, arriba, el buscador (código, nombre o código de barras,
 *    con «Recientes»).
 * 2. La ficha del producto; sin producto, la misma ficha con «—».
 * 3. Su historial (Todos / Entradas / Salidas, con «Totales») o, sin
 *    producto, los últimos movimientos de todos los productos.
 * 4. La barra de acciones, como en Inventario. Cada acción abre su ventana:
 *    - «+ Ingreso»: UN producto sin pedido (compra directa);
 *    - «− Egreso»: UN producto, una salida que no es venta, de un lote;
 *    - «📦 Carga de pedido»: un pedido completo, todos sus productos a la
 *      vez. Pedidos › «Registrar entrega» llega aquí con el pedido ya
 *      elegido (`/movimientos?pedido=<id>`).
 *
 * Los permisos los vuelve a revisar el servidor: el ingreso y la carga de
 * pedido piden `purchasing`; el egreso, `inventory.write`.
 */
export function KardexPage() {
  const { can } = useSession();
  const [params, setParams] = useSearchParams();
  const requested = params.get('productId') ?? '';
  const orderParam = params.get('pedido');
  const validId = isProductId(requested);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  /** Resumen del historial del producto que se ve («Entró · Salió · N movimientos»). */
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
  // Desde Pedidos › «Registrar entrega»: la carga de ese pedido ya abierta.
  const open: Dialog = orderParam !== null && dialog === null ? 'order' : dialog;

  const receiveSummary = useCallback(
    (value: KardexAmounts) => setSummary({ productId: requested, value }),
    [requested],
  );

  // El producto abierto pasa a «Recientes» del buscador (solo en este navegador).
  useEffect(() => {
    if (ready !== null) {
      rememberRecent(ready);
    }
  }, [ready]);

  /** Cierra la ventana; si venía de Pedidos, quita el pedido de la dirección. */
  function close(): void {
    setDialog(null);

    if (orderParam !== null) {
      setParams(requested === '' ? {} : { productId: requested });
    }
  }

  function pick(productId: string): void {
    setNotice(null);
    setDialog(null);
    setParams({ productId });
  }

  function saved(message: string): void {
    setNotice(message);
    close();
    setVersion((current) => current + 1);

    if (validId) {
      // El stock cambió: se vuelve a leer la ficha (si falla, queda la anterior).
      kardexService
        .getProduct(requested)
        .then(setFresh)
        .catch(() => undefined);
    }
  }

  const canEnter = ready !== null && can('purchasing');
  const canExit = ready !== null && can('inventory.write');

  return (
    <>
      <header className="page-header">
        <h1>Movimientos</h1>
        <p>Entradas y salidas del inventario, con el saldo después de cada una.</p>
      </header>

      <div className="kardex-toolbar">
        <KardexSearch onPick={pick} />
        <span className="kardex-toolbar__links">
          {requested === '' ? null : (
            <Link to="/movimientos" onClick={() => setNotice(null)}>
              Limpiar y buscar otro
            </Link>
          )}
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

      {/* La ficha y el historial están siempre en su lugar: mientras llega el
          producto se ven con «—» (sin un aviso que empuje la pantalla). */}
      <ProductSheet
        product={ready}
        loading={product.phase === 'loading' && ready === null}
        summary={summary !== null && summary.productId === requested ? summary.value : null}
      />

      {validId && product.phase !== 'failed' ? (
        <MovementsHistory
          productId={requested}
          stock={ready === null ? null : ready.stock}
          version={version}
          onSummary={receiveSummary}
        />
      ) : (
        <RecentMovements key={version} />
      )}

      <div className="action-bar" role="toolbar" aria-label="Acciones de movimientos">
        <button
          type="button"
          className="action-bar__button"
          disabled={!canEnter}
          onClick={() => setDialog('entry')}
        >
          + Ingreso
        </button>
        <button
          type="button"
          className="action-bar__button"
          disabled={!canExit}
          onClick={() => setDialog('exit')}
        >
          − Egreso
        </button>
        {can('purchasing') ? (
          <button type="button" className="action-bar__button" onClick={() => setDialog('order')}>
            📦 Carga de pedido
          </button>
        ) : null}
        <span className="action-bar__status" role="status">
          {ready === null
            ? 'Busque un producto para un ingreso o egreso; un pedido completo, en «Carga de pedido».'
            : 'Las ventas salen solas desde la caja.'}
        </span>
      </div>

      {ready !== null && open === 'entry' ? (
        <EntryModal product={ready} onSaved={saved} onClose={close} />
      ) : null}
      {ready !== null && open === 'exit' ? (
        <ExitModal product={ready} version={version} onSaved={saved} onClose={close} />
      ) : null}
      {open === 'order' ? (
        <OrderLoadModal orderId={orderParam} onDone={saved} onClose={close} />
      ) : null}
    </>
  );
}
