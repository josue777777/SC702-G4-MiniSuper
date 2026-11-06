import { useState } from 'react';
import { matchesSearch, normalizeSearch } from '../../components/list-search';
import type { Product } from '../../types/products';

interface ProductQuickSearchProps {
  /** Productos donde buscar (normalmente, solo los activos). */
  products: readonly Product[];
  onPick: (product: Product) => void;
  /** Nombre del campo para lectores de pantalla y pruebas. */
  label: string;
  placeholder?: string;
  /** Id del campo, para enlazarlo con un `<label htmlFor>` visible. */
  id?: string;
}

/** Cuántas coincidencias se muestran: suficientes para elegir, sin llenar la ventana. */
const MAX_RESULTS = 6;

/**
 * Buscador para elegir UN producto escribiendo su nombre, su código o su código
 * de barras. Muestra hasta 6 coincidencias mientras se escribe; con Enter elige
 * el producto cuyo código o código de barras coincide exacto, así también sirve
 * con el lector (que «escribe» el código y manda Enter).
 *
 * Se usa donde hay que elegir productos de un catálogo grande sin listarlo
 * entero (etiquetas, conteo físico). Reutiliza los estilos del selector de
 * Movimientos (`kardex-picker__*`).
 *
 * @example escribir «7501234567893» + Enter → elige ese producto y limpia el campo
 */
export function ProductQuickSearch({
  products,
  onPick,
  label,
  placeholder = 'Buscar por nombre, código o código de barras',
  id,
}: ProductQuickSearchProps) {
  const [text, setText] = useState('');
  const term = text.trim();
  const results =
    term === ''
      ? []
      : products
          .filter((product) => matchesSearch(term, product.code, product.name, product.barcode))
          .slice(0, MAX_RESULTS);

  function pick(product: Product): void {
    onPick(product);
    setText('');
  }

  function pickExact(): void {
    const wanted = normalizeSearch(term);
    const exact = products.find(
      (product) =>
        normalizeSearch(product.code) === wanted ||
        (product.barcode !== null && product.barcode === term),
    );
    const only = results.length === 1 ? results[0] : undefined;
    const chosen = exact ?? only;

    if (chosen !== undefined) {
      pick(chosen);
    }
  }

  return (
    <div role="search">
      <input
        id={id}
        type="search"
        className="kardex-picker__input"
        value={text}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            pickExact();
          }
        }}
      />
      {term !== '' && results.length === 0 ? (
        <p className="muted" role="status">
          Ningún producto activo coincide con «{term}».
        </p>
      ) : null}
      {results.length > 0 ? (
        <ul className="kardex-picker__results" aria-label="Productos encontrados">
          {results.map((product) => (
            <li key={product.id}>
              <button type="button" className="kardex-picker__option" onClick={() => pick(product)}>
                <strong>{product.code}</strong> · {product.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
