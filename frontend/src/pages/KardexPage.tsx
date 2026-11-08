import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { isProductId } from '../features/kardex/kardex-format';
import { rememberRecent } from '../features/kardex/kardex-recents';
import { KardexSearch } from '../features/kardex/KardexSearch';
import { MovementsHistory } from '../features/kardex/MovementsHistory';
import { EmptyProductSheet, ProductSheet } from '../features/kardex/ProductSheet';
import { RecentMovements } from '../features/kardex/RecentMovements';
import { useKeyedRequest } from '../features/kardex/use-keyed-request';
import { kardexService } from '../services/kardex.service';

/**
 * Movimientos (kardex): ficha de un producto con sus entradas y salidas (HU-31).
 *
 * Aquí no se cambian cantidades: se consultan los movimientos que ya dejaron
 * las ventas, las devoluciones, los conteos, las ediciones y las entregas de
 * pedidos (HU-38) en la tabla `InventoryMovement`.
 *
 * La pantalla tiene siempre la misma forma, haya o no producto elegido:
 * 1. Arriba, el buscador (código, nombre o código de barras, con «Recientes»).
 * 2. La ficha del producto; sin producto, la misma ficha con «—».
 * 3. Los movimientos: los del producto o, sin producto, los últimos de todos
 *    los productos con lo que entró y salió hoy.
 * 4. Abajo, la barra de acciones (como en Inventario).
 *
 * El producto viaja en la dirección (`/movimientos?productId=<uuid>`): se abre desde
 * Inventario con «Ver movimientos» y se puede compartir o recargar. El id se verifica
 * antes de pedirlo al servidor.
 */
export function KardexPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('productId') ?? '';
  const validId = isProductId(requested);

  const product = useKeyedRequest(
    validId ? `product:${requested}` : null,
    () => kardexService.getProduct(requested),
    'No se pudo cargar la ficha del producto.',
  );
  const ready = product.phase === 'ready' ? product.value : null;

  // El producto abierto pasa a «Recientes» del buscador (solo en este navegador).
  useEffect(() => {
    if (ready !== null) {
      rememberRecent(ready);
    }
  }, [ready]);

  function pick(productId: string): void {
    setParams({ productId });
  }

  return (
    <>
      <header className="page-header">
        <h1>Movimientos</h1>
        <p>Entradas y salidas de cada producto, con el saldo después de cada movimiento.</p>
      </header>

      <div className="kardex-toolbar">
        <KardexSearch onPick={pick} />
        <Link to="/inventory" className="button kardex-back">
          ← Volver a Inventario
        </Link>
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

      {product.phase === 'loading' ? (
        <p className="card muted" role="status">
          Cargando ficha del producto…
        </p>
      ) : null}

      {ready === null ? (
        product.phase === 'loading' ? null : (
          <>
            <EmptyProductSheet />
            <RecentMovements />
          </>
        )
      ) : (
        <>
          <ProductSheet product={ready} />
          {/* La ficha ya se ve: el historial llega aparte y por páginas. */}
          <MovementsHistory productId={ready.id} />
        </>
      )}

      {/* Registrar ingresos y egresos desde aquí es lo siguiente de HU-38. */}
      <div className="action-bar" role="toolbar" aria-label="Acciones de movimientos">
        <button type="button" className="action-bar__button" disabled>
          + Registrar ingreso
        </button>
        <button type="button" className="action-bar__button" disabled>
          − Registrar egreso
        </button>
        <span className="action-bar__status" role="status">
          {ready === null
            ? 'Busque un producto para registrar ingresos o egresos.'
            : 'Pronto se registran aquí. Por ahora, las entradas se registran en Pedidos › Ver pedido.'}
        </span>
      </div>
    </>
  );
}
