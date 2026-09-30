import { useState } from 'react';
import { EMPTY_FORM_VALUES, toFormValues } from '../features/products/product-form';
import { ProductForm } from '../features/products/ProductForm';
import { ProductTable } from '../features/products/ProductTable';
import { useProducts } from '../features/products/use-products';
import type { Product, ProductPayload } from '../types/products';

/**
 * Pantalla de productos: registrar (HU-01), editar (HU-02) y desactivar (HU-03).
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
    reload,
    createProduct,
    updateProduct,
    deactivateProduct,
    dismissNotice,
  } = useProducts();

  /** Producto que se está editando; `null` significa que el formulario es de alta. */
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);

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
        <p>Registrar, editar y desactivar los productos del catálogo.</p>
      </header>

      <div className="toolbar">
        <button
          type="button"
          className="button button--primary"
          onClick={openCreateForm}
          disabled={busy || formOpen}
        >
          + Nuevo producto
        </button>
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
          onEdit={openEditForm}
          onDeactivate={(product) => void deactivateProduct(product.id)}
        />
      ) : null}
    </>
  );
}
