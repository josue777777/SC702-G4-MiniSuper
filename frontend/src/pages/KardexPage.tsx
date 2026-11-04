import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { isProductId } from '../features/kardex/kardex-format';
import { MovementsHistory } from '../features/kardex/MovementsHistory';
import { ProductPicker } from '../features/kardex/ProductPicker';
import { ProductSheet } from '../features/kardex/ProductSheet';
import { useKeyedRequest } from '../features/kardex/use-keyed-request';
import { kardexService } from '../services/kardex.service';

/**
 * Kardex: ficha de un producto con sus entradas y salidas (HU-31).
 *
 * Aquí no se cambian cantidades: se consultan los movimientos que ya dejaron
 * las ventas, las devoluciones, los conteos físicos y las ediciones en la tabla
 * `InventoryMovement` (y, cuando exista HU-38, las recepciones de pedidos), que
 * guarda el stock antes y después de cada uno.
 *
 * El producto viaja en la dirección (`/movimientos?productId=<uuid>`): se abre desde
 * Inventario con «Ver movimientos» y se puede compartir o recargar. El id se verifica
 * antes de pedirlo al servidor.
 */
export function KardexPage() {
  const [params, setParams] = useSearchParams();
  const [choosing, setChoosing] = useState(false);
  const requested = params.get('productId') ?? '';
  const validId = isProductId(requested);

  const product = useKeyedRequest(
    validId ? `product:${requested}` : null,
    () => kardexService.getProduct(requested),
    'No se pudo cargar la ficha del producto.',
  );

  function pick(productId: string): void {
    setChoosing(false);
    setParams({ productId });
  }

  const showPicker = requested === '' || !validId || choosing || product.phase === 'failed';

  return (
    <>
      <header className="page-header">
        <h1>Movimientos</h1>
        <p>Entradas y salidas de cada producto, con el saldo después de cada movimiento.</p>
      </header>

      <p>
        <Link to="/inventory" className="button kardex-back">
          ← Volver a Inventario
        </Link>{' '}
        {requested !== '' && validId && !choosing && product.phase !== 'failed' ? (
          <button type="button" className="button" onClick={() => setChoosing(true)}>
            Elegir otro producto
          </button>
        ) : null}
      </p>

      {requested !== '' && !validId ? (
        <p className="alert alert--error" role="alert">
          El producto indicado en la dirección no es válido. Elija uno de la lista.
        </p>
      ) : null}

      {product.phase === 'failed' ? (
        <p className="alert alert--error" role="alert">
          {product.status === 404
            ? 'El producto no existe o ya no está disponible. Elija otro de la lista.'
            : product.message}
        </p>
      ) : null}

      {showPicker ? <ProductPicker onPick={pick} /> : null}

      {product.phase === 'loading' ? (
        <p className="card muted" role="status">
          Cargando ficha del producto…
        </p>
      ) : null}

      {product.phase === 'ready' ? (
        <>
          <ProductSheet product={product.value} />
          {/* La ficha ya se ve: el historial llega aparte y por páginas. */}
          <MovementsHistory productId={product.value.id} />
        </>
      ) : null}
    </>
  );
}
