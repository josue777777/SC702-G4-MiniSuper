import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Modal } from '../../components/Modal';
import type { Product, ProductImageChange, ProductPayload } from '../../types/products';
import { CategoryForm } from '../categories/CategoryForm';
import { EMPTY_FORM_VALUES, toFormValues } from './product-form';
import { ProductForm } from './ProductForm';
import { ProductTable } from './ProductTable';
import { useProducts } from './use-products';

/** Qué productos muestra la lista. */
type ProductView = 'active' | 'inactive' | 'all';

/** Valor reservado del `<select>` de categoría que no es un id real. */
const NEW_CATEGORY_OPTION = '__new__';

/**
 * Pausa al escribir antes de buscar (HU-05): los resultados aparecen mientras el
 * dueño escribe, pero sin pedir al servidor una consulta por cada tecla.
 */
const SEARCH_DEBOUNCE_MS = 300;

interface ProductsSectionProps {
  /** Se llama después de registrar, editar o desactivar un producto. */
  onProductsChanged?: () => void;
  /** Al cambiar, el catálogo se vuelve a cargar (p. ej. tras un conteo que cambió el stock). */
  refreshKey?: number;
  /** Botones de otras herramientas de Inventario, a la derecha de la barra superior. */
  tools?: ReactNode;
}

/**
 * Sección de productos: registrar (HU-01), editar (HU-02), desactivar (HU-03) y
 * buscar por nombre o código (HU-05). Se muestra dentro de `InventoryPage`.
 *
 * Funciona como una ventana de inventario: la lista ocupa la pantalla, un clic
 * marca un producto y la barra inferior tiene «Crear», «Modificar» y
 * «Desactivar». Crear y modificar se hacen en una ventana modal.
 *
 * La sección solo compone: el estado está en `use-products.ts`, el formulario en
 * `ProductForm.tsx` y el listado en `ProductTable.tsx`. Aquí se decide qué se ve
 * (cargando, error, vacío o tabla) y qué formulario está abierto.
 */
export function ProductsSection({
  onProductsChanged,
  refreshKey = 0,
  tools,
}: ProductsSectionProps = {}) {
  const {
    phase,
    products,
    options,
    message,
    notice,
    busy,
    categoryFilter,
    setCategoryFilter,
    searchTerm,
    setSearchTerm,
    reload,
    createProduct,
    updateProduct,
    deactivateProduct,
    activateProduct,
    deleteProduct,
    afterCategoryCreated,
    dismissNotice,
  } = useProducts();

  /** Producto que se está editando; `null` significa que el formulario es de alta. */
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  /** Producto marcado en la lista (para «Modificar» y «Desactivar»). */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  /** Aviso de la barra inferior cuando se pide una acción sin producto marcado. */
  const [selectionHint, setSelectionHint] = useState<string | null>(null);

  /**
   * Vista de la lista: los desactivados no se venden y solo cargan la lista,
   * así que por defecto se ven los activos. Cada acción vive en su vista:
   * Desactivar en «Activos»; Activar y Borrar en «Desactivados» (HU-03).
   * «Todos» es solo para consultar.
   */
  const [view, setView] = useState<ProductView>('active');
  const activeCount = products.filter((product) => product.isActive).length;
  const inactiveCount = products.length - activeCount;
  const visibleProducts =
    view === 'all'
      ? products
      : products.filter((product) => product.isActive === (view === 'active'));

  // Si el producto marcado ya no está a la vista (otra búsqueda, o se ocultó), se desmarca.
  const selected = visibleProducts.find((product) => product.id === selectedId) ?? null;
  /** Lo que el dueño está escribiendo; se aplica solo tras una breve pausa (HU-05). */
  const [searchInput, setSearchInput] = useState('');

  /** Búsqueda en tiempo real: aplica el texto cuando el dueño deja de escribir. */
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(searchInput), SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [searchInput, setSearchTerm]);

  /** La carga inicial la hace `useProducts`; aquí solo se recarga cuando cambia `refreshKey`. */
  const lastRefreshKey = useRef(refreshKey);

  useEffect(() => {
    if (lastRefreshKey.current === refreshKey) {
      return;
    }

    lastRefreshKey.current = refreshKey;
    void reload();
  }, [refreshKey, reload]);

  /** Enter busca de inmediato, sin esperar la pausa. */
  function handleSearchSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSearchTerm(searchInput);
  }

  /** Vaciar la caja (con «Limpiar» o la × del campo) vuelve al catálogo completo al instante. */
  function handleSearchInputChange(value: string): void {
    setSearchInput(value);

    if (value.trim() === '') {
      setSearchTerm('');
    }
  }

  function openCreateForm(): void {
    setEditing(null);
    setFormOpen(true);
  }

  function openEditForm(product: Product): void {
    setEditing(product);
    setFormOpen(true);
  }

  /**
   * Cierra el formulario y descarta el estado local de edición. Al volver a
   * abrirlo se parte otra vez de los datos guardados (caso borde de HU-02).
   */
  function closeForm(): void {
    setFormOpen(false);
    setEditing(null);
  }

  /** La opción "+ Nueva categoría" abre el formulario y no cambia el filtro. */
  function handleCategorySelect(value: string): void {
    if (value === NEW_CATEGORY_OPTION) {
      setCategoryFormOpen(true);

      return;
    }

    setCategoryFilter(value);
  }

  async function handleSubmit(payload: ProductPayload, image: ProductImageChange): Promise<void> {
    const saved =
      editing === null
        ? await createProduct(payload, image)
        : await updateProduct(editing.id, payload, image);

    // Solo se cierra si se guardó: si hubo un error (código duplicado, por
    // ejemplo) el formulario queda abierto con lo que escribió el dueño.
    if (saved) {
      closeForm();
      onProductsChanged?.();
    }
  }

  function selectProduct(product: Product): void {
    setSelectedId(product.id);
    setSelectionHint(null);
  }

  /** «Modificar» y «Desactivar» necesitan un producto marcado, como en la referencia. */
  function withSelection(action: (product: Product) => void, verb: string): void {
    if (selected === null) {
      setSelectionHint(`Primero seleccione en la lista el producto a ${verb}.`);

      return;
    }

    action(selected);
  }

  /** «Borrar» solo aplica a desactivados (vista «Desactivados»). */
  function requestDelete(): void {
    if (selected === null) {
      setSelectionHint('Primero seleccione en la lista el producto desactivado a borrar.');

      return;
    }

    if (selected.isActive) {
      setSelectionHint('Solo se puede borrar un producto desactivado. Desactívelo primero.');

      return;
    }

    setConfirmingDelete(true);
  }

  /** Activar no necesita confirmación: se puede deshacer desactivándolo otra vez. */
  async function handleActivate(product: Product): Promise<void> {
    if (product.isActive) {
      setSelectionHint(`«${product.name}» ya está activo.`);

      return;
    }

    if (await activateProduct(product.id)) {
      onProductsChanged?.();
    }
  }

  async function handleDelete(product: Product): Promise<void> {
    setConfirmingDelete(false);

    if (await deleteProduct(product.id)) {
      setSelectedId(null);
      onProductsChanged?.();
    }
  }

  async function handleDeactivate(product: Product): Promise<void> {
    setConfirmingDeactivate(false);

    if (await deactivateProduct(product.id)) {
      onProductsChanged?.();
    }
  }

  /** Mensaje de lista vacía según la vista (la búsqueda solo encuentra activos, HU-05). */
  function emptyListText(): string | undefined {
    if (view === 'inactive') {
      return categoryFilter !== '' || searchTerm !== ''
        ? 'La búsqueda y el filtro de categoría solo encuentran productos activos. Límpielos para ver los desactivados.'
        : 'No hay productos desactivados.';
    }

    if (view === 'active' && inactiveCount > 0 && categoryFilter === '' && searchTerm === '') {
      return `No hay productos activos. Hay ${inactiveCount} en «Desactivados».`;
    }

    return undefined;
  }

  /** Selector de vista; va en el encabezado de la tabla porque filtra la lista. */
  const viewSelector = (
    <div className="segmented" role="group" aria-label="Productos a mostrar">
      {(
        [
          ['active', `Activos (${activeCount})`],
          ['inactive', `Desactivados (${inactiveCount})`],
          ['all', 'Todos'],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={view === id ? 'segmented__item segmented__item--active' : 'segmented__item'}
          aria-pressed={view === id}
          onClick={() => {
            setView(id);
            setSelectionHint(null);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className="toolbar">
        <form className="toolbar__search" role="search" onSubmit={handleSearchSubmit}>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => handleSearchInputChange(event.target.value)}
            placeholder="Buscar por nombre o código"
            aria-label="Buscar producto por nombre o código"
            maxLength={120}
          />
          <button type="submit" className="button button--dark">
            Buscar
          </button>
          {searchInput !== '' || searchTerm !== '' ? (
            <button type="button" className="button" onClick={() => handleSearchInputChange('')}>
              Limpiar
            </button>
          ) : null}
        </form>
        <label className="toolbar__filter">
          Categoría{' '}
          <select
            value={categoryFilter}
            onChange={(event) => handleCategorySelect(event.target.value)}
            disabled={busy}
          >
            <option value={NEW_CATEGORY_OPTION}>+ Nueva categoría</option>
            <option value="">Todas</option>
            {options.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        {tools}
      </div>

      {notice === null ? null : (
        <p className={`alert alert--${notice.kind}`} role="status">
          {notice.text}
          <button
            type="button"
            className="alert__close"
            onClick={dismissNotice}
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </p>
      )}

      {categoryFormOpen ? (
        <CategoryForm onCreated={afterCategoryCreated} onClose={() => setCategoryFormOpen(false)} />
      ) : null}

      {formOpen ? (
        <ProductForm
          key={editing?.id ?? 'new'}
          mode={editing === null ? 'create' : 'edit'}
          options={options}
          initialValues={editing === null ? EMPTY_FORM_VALUES : toFormValues(editing)}
          imageUrl={editing?.imageUrl ?? null}
          onCategoryCreated={afterCategoryCreated}
          busy={busy}
          onCancel={closeForm}
          onSubmit={(payload, image) => void handleSubmit(payload, image)}
        />
      ) : null}

      {phase === 'loading' ? <p className="card muted">Cargando productos…</p> : null}

      {phase === 'failed' ? (
        <section className="card">
          <header className="card__header">
            <h2>No se pudo cargar el catálogo</h2>
            <button type="button" className="button" onClick={() => void reload()}>
              Reintentar
            </button>
          </header>
          <p className="badge badge--error">Sin conexión con el servidor</p>
          <p className="muted">{message}</p>
          <p className="muted hint">
            Si el backend no está levantado, ejecute <code>npm run dev</code> y verifique PostgreSQL
            con <code>npm run db:up</code>.
          </p>
        </section>
      ) : null}

      {phase === 'ready' ? (
        <ProductTable
          products={visibleProducts}
          emptyText={emptyListText()}
          headerActions={viewSelector}
          filtered={categoryFilter !== ''}
          searchTerm={searchTerm}
          selectedId={selected?.id ?? null}
          onSelect={selectProduct}
          onOpen={openEditForm}
        />
      ) : null}

      {/* Barra de acciones fija al pie de la ventana, como en la referencia */}
      <div className="action-bar" role="toolbar" aria-label="Acciones del producto">
        <button
          type="button"
          className="action-bar__button"
          onClick={openCreateForm}
          disabled={busy || phase !== 'ready'}
        >
          + Crear
        </button>
        <button
          type="button"
          className="action-bar__button"
          onClick={() => withSelection(openEditForm, 'modificar')}
          disabled={busy || phase !== 'ready'}
        >
          ✎ Modificar
        </button>
        {view === 'active' ? (
          <button
            type="button"
            className="action-bar__button"
            onClick={() =>
              withSelection((product) => {
                if (!product.isActive) {
                  setSelectionHint(`«${product.name}» ya está inactivo.`);

                  return;
                }

                setConfirmingDeactivate(true);
              }, 'desactivar')
            }
            disabled={busy || phase !== 'ready'}
          >
            ✕ Desactivar
          </button>
        ) : null}
        {view === 'inactive' ? (
          <>
            <button
              type="button"
              className="action-bar__button action-bar__button--ok"
              onClick={() => withSelection((product) => void handleActivate(product), 'activar')}
              disabled={busy || phase !== 'ready'}
            >
              ✓ Activar
            </button>
            {/* Más adelante, solo visible para el administrador (HU-11 … HU-15). */}
            <button
              type="button"
              className="action-bar__button action-bar__button--danger"
              onClick={requestDelete}
              disabled={busy || phase !== 'ready'}
            >
              🗑 Borrar
            </button>
          </>
        ) : null}
        <span className="action-bar__status" role="status">
          {selectionHint ??
            (selected === null ? '' : `Seleccionado: ${selected.code} · ${selected.name}`)}
        </span>
      </div>

      {confirmingDelete && selected !== null ? (
        <Modal title="Borrar producto" onClose={() => setConfirmingDelete(false)}>
          <p>
            Confirme BORRAR el producto <strong>{selected.code}</strong> ·{' '}
            <strong>{selected.name}</strong>.
          </p>
          <p className="alert alert--warning">
            Esta operación no se puede deshacer. Si el producto aparece en ventas o pedidos no se
            borra: se queda desactivado para conservar el historial.
          </p>
          <div className="form__actions modal__actions">
            <button
              type="button"
              className="button button--danger-solid"
              disabled={busy}
              onClick={() => void handleDelete(selected)}
            >
              Sí, borrar para siempre
            </button>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => setConfirmingDelete(false)}
            >
              Cancelar
            </button>
          </div>
        </Modal>
      ) : null}

      {confirmingDeactivate && selected !== null ? (
        <Modal title="Desactivar producto" onClose={() => setConfirmingDeactivate(false)}>
          <p>
            Confirme desactivar el producto <strong>{selected.code}</strong> ·{' '}
            <strong>{selected.name}</strong>.
          </p>
          <p className="muted">
            Ya no estará disponible para nuevas ventas; su historial de ventas e inventario se
            conserva.
          </p>
          <div className="form__actions modal__actions">
            <button
              type="button"
              className="button button--danger"
              disabled={busy}
              onClick={() => void handleDeactivate(selected)}
            >
              Sí, desactivar
            </button>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => setConfirmingDeactivate(false)}
            >
              Cancelar
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
