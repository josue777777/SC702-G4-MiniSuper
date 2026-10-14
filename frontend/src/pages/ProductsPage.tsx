import { useEffect, useState, type FormEvent } from 'react';
import { CategoryForm } from '../features/categories/CategoryForm';
import { EMPTY_FORM_VALUES, toFormValues } from '../features/products/product-form';
import { ProductForm } from '../features/products/ProductForm';
import { ProductTable } from '../features/products/ProductTable';
import { useProducts } from '../features/products/use-products';
import type { Product, ProductPayload } from '../types/products';

/** Valor reservado del `<select>` de categoría que no es un id real. */
const NEW_CATEGORY_OPTION = '__new__';

/**
 * Pausa al escribir antes de buscar (HU-05): los resultados aparecen mientras el
 * dueño escribe, pero sin pedir al servidor una consulta por cada tecla.
 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Pantalla de productos: registrar (HU-01), editar (HU-02), desactivar (HU-03) y
 * buscar por nombre o código (HU-05).
 *
 * La página solo compone: el estado está en `use-products.ts`, el formulario en
 * `ProductForm.tsx` y el listado en `ProductTable.tsx`. Aquí se decide qué se ve
 * (cargando, error, vacío o tabla) y qué formulario está abierto.
 */
export function ProductsPage() {
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
    afterCategoryCreated,
    dismissNotice,
  } = useProducts();

  /** Producto que se está editando; `null` significa que el formulario es de alta. */
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  /** Lo que el dueño está escribiendo; se aplica solo tras una breve pausa (HU-05). */
  const [searchInput, setSearchInput] = useState('');

  /** Búsqueda en tiempo real: aplica el texto cuando el dueño deja de escribir. */
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(searchInput), SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [searchInput, setSearchTerm]);

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

  async function handleSubmit(payload: ProductPayload): Promise<void> {
    const saved =
      editing === null ? await createProduct(payload) : await updateProduct(editing.id, payload);

    // Solo se cierra si se guardó: si hubo un error (código duplicado, por
    // ejemplo) el formulario queda abierto con lo que escribió el dueño.
    if (saved) {
      closeForm();
    }
  }

  return (
    <>
      <header className="page-header">
        <h1>Productos</h1>
      </header>

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
          {searchInput !== '' || searchTerm !== '' ? (
            <button type="button" className="button" onClick={() => handleSearchInputChange('')}>
              Limpiar
            </button>
          ) : null}
        </form>
        <button
          type="button"
          className="button button--primary"
          onClick={openCreateForm}
          disabled={busy || formOpen}
        >
          + Nuevo producto
        </button>
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
        <CategoryForm
          onCreated={afterCategoryCreated}
          onClose={() => setCategoryFormOpen(false)}
        />
      ) : null}

      {formOpen ? (
        <ProductForm
          key={editing?.id ?? 'new'}
          mode={editing === null ? 'create' : 'edit'}
          options={options}
          initialValues={editing === null ? EMPTY_FORM_VALUES : toFormValues(editing)}
          busy={busy}
          onCancel={closeForm}
          onSubmit={(payload) => void handleSubmit(payload)}
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
          products={products}
          busy={busy}
          filtered={categoryFilter !== ''}
          searchTerm={searchTerm}
          onEdit={openEditForm}
          onDeactivate={(product) => void deactivateProduct(product.id)}
        />
      ) : null}
    </>
  );
}
