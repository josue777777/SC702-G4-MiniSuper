import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { MAX_SUGGESTIONS } from '../../components/use-pagination';
import { kardexService } from '../../services/kardex.service';
import type { KardexProductOption } from '../../types/kardex';
import { loadRecents, type RecentProduct } from './kardex-recents';
import { useKeyedRequest } from './use-keyed-request';

/** Pausa al escribir antes de buscar, como en la búsqueda de productos (HU-05). */
const SEARCH_DEBOUNCE_MS = 300;

/** Opción de la lista: un producto encontrado o uno reciente (este no trae stock). */
type Option = RecentProduct & Partial<Pick<KardexProductOption, 'stock' | 'isActive'>>;

/**
 * Buscador de Movimientos (HU-31): una sola barra arriba, siempre a la vista,
 * por código, nombre o código de barras (el lector escribe el código y
 * Enter). Al entrar en la caja se despliega la lista: sin texto, los productos
 * abiertos hace poco en este equipo («Recientes»); con texto, los que
 * coinciden, con su stock. Como mucho 6 (regla 2): lo demás se encuentra
 * escribiendo más. Se elige con el ratón o con ↑ ↓ y Enter.
 *
 * «Buscar» (o Enter sin nada marcado) busca ya: si hay un solo producto, lo
 * abre; si hay varios, muestra la lista para elegir.
 */
export function KardexSearch({ onPick }: { onPick: (productId: string) => void }) {
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recents, setRecents] = useState<RecentProduct[]>(loadRecents);
  const [notFound, setNotFound] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(input.trim()), SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [input]);

  const found = useKeyedRequest(
    term === '' ? null : `search:${term}`,
    () => kardexService.searchProducts(term),
    'No se pudieron buscar los productos.',
  );
  const searching = input.trim() !== '';
  const options: Option[] = searching
    ? found.phase === 'ready'
      ? found.value.slice(0, MAX_SUGGESTIONS)
      : []
    : recents;
  const current = active >= 0 && active < options.length ? active : -1;

  function openList(): void {
    setRecents(loadRecents());
    setActive(-1);
    setOpen(true);
  }

  function choose(option: Option): void {
    setOpen(false);
    setInput('');
    setActive(-1);
    setNotFound(null);
    onPick(option.id);
  }

  async function searchNow(): Promise<void> {
    const text = input.trim();

    if (text === '') {
      setOpen(true);

      return;
    }

    try {
      const list = await kardexService.searchProducts(text);

      if (list.length === 1 && list[0] !== undefined) {
        choose(list[0]);

        return;
      }

      setTerm(text);
      setNotFound(list.length === 0 ? `Ningún producto coincide con «${text}».` : null);
      setOpen(list.length > 0);
    } catch {
      setNotFound('No se pudieron buscar los productos.');
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown' && options.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index + 1) % options.length);
    } else if (event.key === 'ArrowUp' && options.length > 0) {
      event.preventDefault();
      setActive((index) => (index <= 0 ? options.length - 1 : index - 1));
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const marked = options[current];

    if (open && marked !== undefined) {
      choose(marked);
    } else {
      void searchNow();
    }
  }

  const listLabel = searching ? 'Productos encontrados' : 'Productos recientes';

  return (
    <form className="kardex-search" role="search" onSubmit={submit}>
      <div className="kardex-search__box">
        <input
          type="search"
          className="kardex-search__input"
          role="combobox"
          aria-label="Buscar producto por código, nombre o código de barras"
          aria-expanded={open}
          aria-controls="kardex-search-results"
          aria-activedescendant={current >= 0 ? `kardex-option-${current}` : undefined}
          placeholder="Código, nombre o código de barras"
          autoComplete="off"
          maxLength={120}
          value={input}
          // Al entrar o al tocar la caja (aunque ya tuviera el foco), la lista se abre
          // con los recientes al día.
          onFocus={openList}
          onClick={openList}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            setInput(event.target.value);
            setActive(-1);
            setNotFound(null);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {open ? (
          <div className="kardex-search__dropdown">
            <p className="kardex-search__heading">{searching ? 'Productos' : 'Recientes'}</p>
            {searching && found.phase === 'loading' ? (
              <p className="kardex-search__empty" role="status">
                Buscando…
              </p>
            ) : null}
            {searching && found.phase === 'ready' && options.length === 0 ? (
              <p className="kardex-search__empty" role="status">
                Ningún producto coincide con «{term}».
              </p>
            ) : null}
            {!searching && options.length === 0 ? (
              <p className="kardex-search__empty">
                Aquí aparecen los productos que abra. Escriba un código o un nombre.
              </p>
            ) : null}
            {options.length > 0 ? (
              <ul id="kardex-search-results" role="listbox" aria-label={listLabel}>
                {options.map((option, index) => (
                  <li
                    key={option.id}
                    id={`kardex-option-${index}`}
                    role="option"
                    aria-selected={index === current}
                  >
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={`${option.code} · ${option.name}`}
                      className={
                        index === current
                          ? 'kardex-search__option kardex-search__option--active'
                          : 'kardex-search__option'
                      }
                      // Antes de que la caja pierda el foco y cierre la lista.
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => choose(option)}
                    >
                      <strong>{option.code}</strong>
                      <span>
                        {option.name}
                        {option.isActive === false ? (
                          <span className="badge badge--muted">Inactivo</span>
                        ) : null}
                      </span>
                      <span className="muted">
                        {option.stock === undefined
                          ? ''
                          : `${option.stock.toLocaleString('es-CR')} en stock`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
      <button type="submit" className="button button--primary">
        🔍 Buscar
      </button>
      {notFound === null ? null : (
        <p className="form__error kardex-search__notice" role="alert">
          {notFound}
        </p>
      )}
    </form>
  );
}
