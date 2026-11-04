import { useEffect, useState, type KeyboardEvent } from 'react';
import { Modal } from '../../components/Modal';
import { ApiError } from '../../services/api-client';
import { salesService } from '../../services/sales.service';
import type { SaleProduct } from '../../types/sales';
import { formatMoney } from '../products/money';

interface ProductSearchModalProps {
  /** Texto con el que abre (por ejemplo, el código que el lector no encontró). */
  initialTerm?: string;
  onPick: (product: SaleProduct) => void;
  onClose: () => void;
}

/** Pausa al escribir antes de buscar: una consulta por palabra, no por letra. */
const SEARCH_DELAY_MS = 250;

type SearchState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; products: SaleProduct[] }
  | { phase: 'failed'; message: string };

/**
 * Plan B del lector (HU-16): cuando el código no se lee o el producto no tiene
 * código, el cajero lo busca por nombre (o por parte del código) y lo agrega
 * con un clic o con Enter. Agrega con las mismas reglas que el escáner.
 *
 * Solo ofrece productos activos, como mucho 10, y muestra su precio y stock;
 * uno sin stock se ve pero no se puede elegir.
 */
export function ProductSearchModal({ initialTerm = '', onPick, onClose }: ProductSearchModalProps) {
  const [term, setTerm] = useState(initialTerm);
  const [state, setState] = useState<SearchState>({ phase: 'idle' });
  const [active, setActive] = useState(0);
  const wanted = term.trim();

  useEffect(() => {
    if (wanted.length < 2) {
      setState({ phase: 'idle' });
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setState({ phase: 'loading' });
      salesService
        .searchProducts(wanted)
        .then((products) => {
          if (!cancelled) {
            setState({ phase: 'ready', products });
            setActive(0);
          }
        })
        .catch((caught: unknown) => {
          if (!cancelled) {
            setState({
              phase: 'failed',
              message:
                caught instanceof ApiError ? caught.message : 'No se pudo buscar el producto.',
            });
          }
        });
    }, SEARCH_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [wanted]);

  const products = state.phase === 'ready' ? state.products : [];

  function pick(product: SaleProduct | undefined): void {
    if (product !== undefined && product.stock > 0) {
      onPick(product);
    }
  }

  // Flechas para moverse entre resultados y Enter para agregar, sin soltar el teclado.
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, products.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pick(products[active]);
    } else if (event.key === 'Escape') {
      // En un campo de búsqueda, Chrome usa el primer Esc para borrar el texto;
      // aquí Esc siempre cierra, como dice la pista y como espera el cajero.
      event.preventDefault();
      onClose();
    }
  }

  return (
    <Modal title="Buscar producto" onClose={onClose}>
      <div className="form__field">
        <label htmlFor="pos-search">Nombre o código del producto</label>
        <input
          id="pos-search"
          type="search"
          value={term}
          maxLength={60}
          autoComplete="off"
          autoFocus
          placeholder="Por ejemplo: arroz, leche, P001"
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <small className="muted">↑ ↓ para moverse · Enter para agregar · Esc para cerrar</small>
      </div>

      {state.phase === 'idle' ? (
        <p className="muted">Escriba al menos 2 letras del nombre o del código.</p>
      ) : null}
      {state.phase === 'loading' ? (
        <p className="muted" role="status">
          Buscando…
        </p>
      ) : null}
      {state.phase === 'failed' ? (
        <p className="alert alert--error" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.phase === 'ready' && products.length === 0 ? (
        <p className="muted" role="status">
          Ningún producto activo coincide con «{wanted}».
        </p>
      ) : null}

      {products.length === 0 ? null : (
        <ul className="pos-search__results" aria-label="Productos encontrados">
          {products.map((product, index) => (
            <li key={product.id}>
              <button
                type="button"
                className={
                  index === active
                    ? 'pos-search__item pos-search__item--active'
                    : 'pos-search__item'
                }
                disabled={product.stock <= 0}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(product)}
              >
                <span>
                  <strong>{product.name}</strong>
                  <span className="pos__code">
                    {product.code}
                    {product.barcode === null ? '' : ` · ${product.barcode}`}
                  </span>
                </span>
                <span className="pos-search__meta">
                  <strong>{formatMoney(product.price)}</strong>
                  <span className={product.stock > 0 ? 'muted' : 'text-error'}>
                    {product.stock > 0 ? `Stock: ${product.stock}` : 'Sin stock'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
