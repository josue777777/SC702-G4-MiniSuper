import { useEffect, useState } from 'react';
import { kardexService } from '../../services/kardex.service';
import { useKeyedRequest } from './use-keyed-request';

/** Pausa al escribir antes de buscar, como en la búsqueda de productos (HU-05). */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Sin texto se sugieren pocos productos: el selector invita a buscar en lugar
 * de recorrer el catálogo. El servidor ya devuelve como máximo 20 por búsqueda.
 */
const SUGGESTIONS_WITHOUT_SEARCH = 8;

interface ProductPickerProps {
  onPick: (productId: string) => void;
}

/**
 * Selector de producto del Kardex: busca por nombre o código e incluye los
 * desactivados (conservan su historial). Sin texto sugiere solo los primeros
 * productos; los demás aparecen al buscar.
 */
export function ProductPicker({ onPick }: ProductPickerProps) {
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(input.trim()), SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [input]);

  const options = useKeyedRequest(
    `options:${term}`,
    () => kardexService.searchProducts(term),
    'No se pudieron cargar los productos.',
  );

  const shown =
    options.phase === 'ready' && term === ''
      ? options.value.slice(0, SUGGESTIONS_WITHOUT_SEARCH)
      : options.phase === 'ready'
        ? options.value
        : [];
  const hidden = options.phase === 'ready' ? options.value.length - shown.length : 0;

  return (
    <section className="card" aria-label="Elegir producto">
      <header className="card__header">
        <h2>Elegir un producto</h2>
      </header>
      <input
        type="search"
        className="kardex-picker__input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Buscar por nombre o código"
        aria-label="Buscar producto por nombre o código"
        maxLength={120}
      />

      {options.phase === 'loading' ? (
        <p className="muted" role="status">
          Buscando productos…
        </p>
      ) : null}

      {options.phase === 'failed' ? (
        <p className="alert alert--error" role="alert">
          {options.message}
        </p>
      ) : null}

      {options.phase === 'ready' && options.value.length === 0 ? (
        <p className="muted" role="status">
          {term === '' ? 'Todavía no hay productos.' : `Ningún producto coincide con «${term}».`}
        </p>
      ) : null}

      {shown.length > 0 ? (
        <ul className="kardex-picker__results" aria-label="Productos encontrados">
          {shown.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                className="kardex-picker__option"
                onClick={() => onPick(option.id)}
              >
                <strong>{option.code}</strong> · {option.name}
                {option.isActive ? null : <span className="badge badge--muted">Inactivo</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {hidden > 0 ? (
        <p className="muted">Escriba el nombre o el código para encontrar los demás productos.</p>
      ) : null}
    </section>
  );
}
