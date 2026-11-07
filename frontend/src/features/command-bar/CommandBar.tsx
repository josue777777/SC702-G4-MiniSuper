import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { matchesSearch } from '../../components/list-search';
import { Modal } from '../../components/Modal';
import { MAX_SUGGESTIONS } from '../../components/use-pagination';
import { productsService } from '../../services/products.service';
import type { Product } from '../../types/products';
import { useSession } from '../auth/session-context';
import { commandsFor, filterCommands, isCommandShortcut, type Command } from './commands';

/** ¿Mac? Para mostrar ⌘ en lugar de Ctrl. */
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Barra de comandos de la barra superior: un botón «Buscar o ir a…» que también
 * se abre con `Ctrl + K` (`⌘ + K` en Mac) desde cualquier pantalla. Se escribe
 * lo que se quiere hacer («venta», «conteo», «cliente») o el nombre de un
 * producto, se elige con ↑ ↓ y se abre con Enter, sin tocar el ratón.
 *
 * Un producto lleva a sus movimientos (Kardex) si el rol los ve; si no, a
 * Inventario. Los comandos respetan los permisos del rol (`commandsFor`).
 */
export function CommandBar() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (isCommandShortcut(event)) {
        // El navegador usa Ctrl + K para su propia búsqueda: aquí manda el sistema.
        event.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        className="button topbar__command"
        aria-keyshortcuts="Control+K Meta+K"
        onClick={() => setOpen(true)}
      >
        🔍 Buscar o ir a… <kbd>{IS_MAC ? '⌘' : 'Ctrl'}</kbd> <kbd>K</kbd>
      </button>
      {open ? <CommandPalette onClose={() => setOpen(false)} /> : null}
    </>
  );
}

interface Option {
  id: string;
  label: string;
  hint: string;
  to: string;
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const { can } = useSession();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const commands = useMemo(() => commandsFor(can), [can]);
  const canSearchProducts = can('inventory.read');
  const productTarget = can('kardex') ? 'kardex' : 'inventory';

  useEffect(() => {
    if (!canSearchProducts) {
      return;
    }

    // Si falla, la barra sigue sirviendo para los comandos.
    productsService
      .list()
      .then((list) => setProducts(list.filter((product) => product.isActive)))
      .catch(() => setProducts([]));
  }, [canSearchProducts]);

  const term = text.trim();
  // Como mucho 6 sugerencias (tareas primero): la ventana no crece; lo demás se
  // encuentra escribiendo más (regla 2).
  const options: Option[] = [
    ...filterCommands(commands, text).map((command: Command) => command),
    ...(term === ''
      ? []
      : products
          .filter((product) => matchesSearch(term, product.code, product.name, product.barcode))
          .slice(0, MAX_SUGGESTIONS)
          .map((product) => ({
            id: `product-${product.id}`,
            label: `${product.code} · ${product.name}`,
            hint: productTarget === 'kardex' ? 'Producto · ver movimientos' : 'Producto',
            to:
              productTarget === 'kardex'
                ? `/movimientos?productId=${encodeURIComponent(product.id)}`
                : '/inventory',
          }))),
  ].slice(0, MAX_SUGGESTIONS);
  const current = Math.min(active, Math.max(0, options.length - 1));

  function go(option: Option | undefined): void {
    if (option === undefined) {
      return;
    }

    onClose();
    void navigate(option.to);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (options.length === 0 ? 0 : (index + 1) % options.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) =>
        options.length === 0 ? 0 : (index - 1 + options.length) % options.length,
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(options[current]);
    }
  }

  return (
    <Modal title="Buscar o ir a…" onClose={onClose}>
      <input
        type="search"
        className="kardex-picker__input"
        role="combobox"
        aria-label="Qué quiere hacer"
        aria-expanded="true"
        aria-controls="command-results"
        aria-activedescendant={options[current] === undefined ? undefined : `command-${current}`}
        placeholder="Escriba: venta, cliente, conteo, un producto…"
        autoComplete="off"
        data-autofocus
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      {options.length === 0 ? (
        <p className="muted" role="status">
          Nada coincide con «{term}».
        </p>
      ) : (
        <ul id="command-results" className="kardex-picker__results" role="listbox">
          {options.map((option, index) => (
            <li
              key={option.id}
              id={`command-${index}`}
              role="option"
              aria-selected={index === current}
            >
              <button
                type="button"
                tabIndex={-1}
                className={
                  index === current
                    ? 'kardex-picker__option kardex-picker__option--active'
                    : 'kardex-picker__option'
                }
                onMouseEnter={() => setActive(index)}
                onClick={() => go(option)}
              >
                <strong>{option.label}</strong> <span className="muted">· {option.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted hint">
        <kbd>↑</kbd> <kbd>↓</kbd> para elegir · <kbd>Enter</kbd> para abrir · <kbd>Esc</kbd> para
        cerrar
      </p>
    </Modal>
  );
}
