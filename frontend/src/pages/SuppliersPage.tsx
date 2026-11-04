import { useMemo, useState } from 'react';
import { ListSearch } from '../components/ListSearch';
import { matchesSearch } from '../components/list-search';
import { EMPTY_SUPPLIER_VALUES, toSupplierFormValues } from '../features/suppliers/supplier-form';
import { SupplierForm } from '../features/suppliers/SupplierForm';
import { SupplierTable } from '../features/suppliers/SupplierTable';
import { useSuppliers } from '../features/suppliers/use-suppliers';
import type { Supplier, SupplierPayload } from '../types/suppliers';

/** Proveedores: registrar y editar, con los productos que suministra cada uno (HU-21). */
export function SuppliersPage() {
  const {
    phase,
    suppliers,
    products,
    message,
    notice,
    busy,
    reload,
    createSupplier,
    updateSupplier,
    dismissNotice,
  } = useSuppliers();

  /** Proveedor en edición; `null` con el formulario abierto significa alta. */
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState('');
  const visible = useMemo(
    () =>
      suppliers.filter((supplier) =>
        matchesSearch(
          search,
          supplier.name,
          supplier.contactName,
          supplier.phone,
          supplier.email,
          ...supplier.products.flatMap((product) => [product.productName, product.productCode]),
        ),
      ),
    [suppliers, search],
  );

  function closeForm(): void {
    setFormOpen(false);
    setEditing(null);
  }

  function cancelForm(): void {
    closeForm();
    dismissNotice();
  }

  async function handleSubmit(payload: SupplierPayload): Promise<void> {
    const saved =
      editing === null ? await createSupplier(payload) : await updateSupplier(editing.id, payload);

    if (saved) {
      closeForm();
    }
  }

  return (
    <>
      <header className="page-header">
        <h1>Proveedores</h1>
        <p>Saber a quién pedirle cada producto y a qué costo se le compra.</p>
      </header>

      <div className="toolbar">
        <ListSearch
          value={search}
          onChange={setSearch}
          placeholder="Buscar proveedor o producto"
          label="Buscar proveedores"
        />
        <button
          type="button"
          className="button button--primary"
          disabled={busy || formOpen || phase !== 'ready'}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          + Nuevo proveedor
        </button>
      </div>

      {/* Con el formulario abierto, el error se ve dentro de la ventana modal. */}
      {notice === null || (formOpen && notice.kind === 'error') ? null : (
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
        <SupplierForm
          key={editing?.id ?? 'new'}
          mode={editing === null ? 'create' : 'edit'}
          products={products}
          initialValues={editing === null ? EMPTY_SUPPLIER_VALUES : toSupplierFormValues(editing)}
          lockedProductIds={
            editing === null
              ? []
              : editing.products
                  .filter((product) => product.isPreferred)
                  .map((product) => product.productId)
          }
          busy={busy}
          serverError={notice?.kind === 'error' ? notice.text : null}
          onCancel={cancelForm}
          onSubmit={(payload) => void handleSubmit(payload)}
        />
      ) : null}

      {phase === 'loading' ? <p className="card muted">Cargando proveedores…</p> : null}

      {phase === 'failed' ? (
        <section className="card">
          <header className="card__header">
            <h2>No se pudieron cargar los proveedores</h2>
            <button type="button" className="button" onClick={() => void reload()}>
              Reintentar
            </button>
          </header>
          <p className="muted">{message}</p>
        </section>
      ) : null}

      {phase === 'ready' ? (
        <SupplierTable
          suppliers={visible}
          totalCount={suppliers.length}
          search={search}
          busy={busy || formOpen}
          onEdit={(supplier) => {
            setEditing(supplier);
            setFormOpen(true);
          }}
        />
      ) : null}
    </>
  );
}
