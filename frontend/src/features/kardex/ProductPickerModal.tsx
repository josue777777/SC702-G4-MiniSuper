import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { categoriesService } from '../../services/categories.service';
import { kardexService } from '../../services/kardex.service';
import type { Category } from '../../types/categories';
import type { KardexProductOption } from '../../types/kardex';
import { loadRecents, type RecentProduct } from './kardex-recents';
import { useKeyedRequest } from './use-keyed-request';

/** Pausa al escribir antes de buscar, como en la búsqueda de productos (HU-05). */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * El producto que escribió el lector (o la persona) con su código exacto: el
 * código de barras completo o el código interno, sin distinguir mayúsculas.
 *
 * @example exactMatch([{ code: 'P001', barcode: '750…', … }], 'p001'); // el P001
 */
function exactMatch(items: KardexProductOption[], text: string): KardexProductOption | undefined {
  const wanted = text.trim().toLowerCase();

  return items.find(
    (item) => item.code.toLowerCase() === wanted || (item.barcode ?? '') === text.trim(),
  );
}

interface ProductPickerModalProps {
  onPick: (productId: string) => void;
  onClose: () => void;
}

/**
 * «Buscar producto» de Movimientos (HU-31): una ventana con TODOS los productos
 * (también los desactivados, que conservan su historial), de 4 en 4 como toda
 * ventana (regla 2), paginados en el servidor. Dentro de la misma ventana:
 *
 * - la caja de búsqueda por código, nombre o código de barras (filtra
 *   mientras se escribe); con el lector, el código + Enter abre el producto;
 * - el filtro por categoría;
 * - «Recientes»: los últimos productos abiertos en este equipo, a un toque.
 *
 * Mientras llega otra página se sigue viendo la anterior (no salta).
 */
export function ProductPickerModal({ onPick, onClose }: ProductPickerModalProps) {
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recents] = useState<RecentProduct[]>(loadRecents);
  const [notFound, setNotFound] = useState<string | null>(null);
  const searchBox = useRef<HTMLInputElement>(null);

  // La caja ya tiene el foco: se escribe o se escanea sin tocar nada más.
  useEffect(() => {
    searchBox.current?.focus();
  }, []);

  useEffect(() => {
    categoriesService
      .list()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  // Busca al dejar de escribir; cambiar la búsqueda vuelve a la primera página.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTerm(input.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [input]);

  const found = useKeyedRequest(
    `${term}|${categoryId}|${page}`,
    () => kardexService.searchProducts({ search: term, categoryId, page }),
    'No se pudieron cargar los productos.',
  );
  const shown =
    found.phase === 'ready'
      ? found.value
      : found.phase === 'loading'
        ? (found.previous?.value ?? null)
        : null;
  const busy = found.phase === 'loading';

  /** Enter: con el código exacto (lector) o un solo resultado, abre el producto. */
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const text = input.trim();

    if (text === '') {
      return;
    }

    setNotFound(null);

    try {
      const result = await kardexService.searchProducts({ search: text, categoryId, page: 1 });
      const match =
        exactMatch(result.items, text) ?? (result.total === 1 ? result.items[0] : undefined);

      if (match !== undefined) {
        onPick(match.id);
      } else if (result.total === 0) {
        setNotFound(`No hay productos con «${text}».`);
      } else {
        // Varios: se ven en la tabla para elegir.
        setTerm(text);
        setPage(1);
      }
    } catch {
      setNotFound('No se pudo buscar el producto. Intente de nuevo.');
    }
  }

  const from = shown === null || shown.total === 0 ? 0 : (shown.page - 1) * shown.pageSize + 1;
  const to = shown === null ? 0 : from + shown.items.length - 1;

  return (
    <Modal title="Buscar producto" size="wide" onClose={onClose}>
      <div className="toolbar">
        <form className="toolbar__search" role="search" onSubmit={(event) => void submit(event)}>
          <input
            ref={searchBox}
            type="search"
            value={input}
            maxLength={120}
            autoComplete="off"
            placeholder="Código, nombre o barras"
            aria-label="Buscar producto por código, nombre o código de barras"
            onChange={(event) => {
              setInput(event.target.value);
              setNotFound(null);
            }}
          />
          <button type="submit" className="button button--primary">
            🔍 Buscar
          </button>
        </form>
        <label className="toolbar__filter">
          <span>Categoría</span>
          <select
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {notFound === null ? null : (
        <p className="form__error" role="alert">
          {notFound}
        </p>
      )}

      {recents.length === 0 || term !== '' || categoryId !== '' ? null : (
        <div className="product-picker__recents" role="group" aria-label="Productos recientes">
          <span className="muted">Recientes:</span>
          {recents.map((recent) => (
            <button
              key={recent.id}
              type="button"
              className="button"
              onClick={() => onPick(recent.id)}
            >
              {recent.code} · {recent.name}
            </button>
          ))}
        </div>
      )}

      {found.phase === 'failed' ? (
        <p className="alert alert--error" role="alert">
          {found.message}
        </p>
      ) : shown === null ? (
        <p className="muted" role="status">
          Cargando productos…
        </p>
      ) : shown.total === 0 ? (
        <p className="muted" role="status">
          {term === '' ? 'No hay productos en esta categoría.' : `No hay productos con «${term}».`}
        </p>
      ) : (
        <div className={busy ? 'table-wrapper kardex-history--busy' : 'table-wrapper'}>
          <table className="table" aria-label="Productos">
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th>Categoría</th>
                <th className="table__number">Stock</th>
                <th>
                  <span className="visually-hidden">Acción</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.code}</td>
                  <td>
                    {item.name}
                    {item.isActive ? null : (
                      <>
                        {' '}
                        <span className="badge badge--muted">Inactivo</span>
                      </>
                    )}
                  </td>
                  <td>{item.categoryName}</td>
                  <td className="table__number">{item.stock.toLocaleString('es-CR')}</td>
                  <td>
                    <button
                      type="button"
                      className="button button--primary"
                      aria-label={`Ver movimientos de ${item.code} ${item.name}`}
                      onClick={() => onPick(item.id)}
                    >
                      Ver movimientos
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {shown === null ? null : (
        <Pagination
          page={shown.page}
          pageCount={shown.totalPages}
          total={shown.total}
          from={from}
          to={to}
          itemLabel="productos"
          busy={busy}
          onPage={setPage}
        />
      )}
    </Modal>
  );
}
