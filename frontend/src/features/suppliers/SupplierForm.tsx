import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { matchesSearch } from '../../components/list-search';
import { ListSearch } from '../../components/ListSearch';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { MODAL_PAGE_SIZE, usePagination } from '../../components/use-pagination';
import { ProductQuickSearch } from '../products/ProductQuickSearch';
import type { Product } from '../../types/products';
import type { SupplierFormValues, SupplierPayload } from '../../types/suppliers';
import {
  hasSupplierErrors,
  toSupplierPayload,
  validateSupplierForm,
  type SupplierFormErrors,
} from './supplier-form';

interface SupplierFormProps {
  mode: 'create' | 'edit';
  products: Product[];
  initialValues: SupplierFormValues;
  /** Productos de los que este proveedor es el principal: no se pueden quitar aquí. */
  lockedProductIds: string[];
  busy: boolean;
  /** Error que devolvió la API al guardar; se muestra dentro de la ventana. */
  serverError?: string | null;
  onCancel: () => void;
  onSubmit: (payload: SupplierPayload) => void;
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="form__field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

/**
 * Formulario de proveedor (HU-21): datos de contacto y productos que
 * suministra, cada uno con su costo. Sirve para registrar y para editar; al
 * registrar solo se piden los datos de contacto, porque el producto se liga a
 * su proveedor principal desde Inventario.
 * Se abre en una ventana modal, igual que los productos y los pedidos.
 *
 * Productos que suministra (al editar): se agregan BUSCANDO el producto
 * (nunca con una lista desplegable de todo el catálogo) y se ven de 4 en 4 con
 * su buscador, para que la ventana no crezca (docs/PANTALLAS.md, reglas 2 y 3).
 */
export function SupplierForm({
  mode,
  products,
  initialValues,
  lockedProductIds,
  busy,
  serverError = null,
  onCancel,
  onSubmit,
}: SupplierFormProps) {
  const [values, setValues] = useState<SupplierFormValues>(initialValues);
  const [errors, setErrors] = useState<SupplierFormErrors>({});
  const [productSearch, setProductSearch] = useState('');
  const byId = new Map(products.map((product) => [product.id, product]));
  // Cada fila con su posición real en `values.products` (las páginas muestran un trozo).
  const indexedRows = values.products
    .map((row, index) => ({ row, index, product: byId.get(row.productId) }))
    .filter(({ product }) =>
      matchesSearch(productSearch, product?.code ?? '', product?.name ?? ''),
    );
  const pages = usePagination(
    indexedRows,
    `${productSearch}|${values.products.length}`,
    MODAL_PAGE_SIZE,
  );
  const chosenIds = new Set(values.products.map((row) => row.productId));
  const addable = products.filter((product) => product.isActive && !chosenIds.has(product.id));

  type TextField = Exclude<keyof SupplierFormValues, 'products'>;

  function updateField(field: TextField, value: string): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function updateCost(index: number, value: string): void {
    setValues((current) => ({
      ...current,
      products: current.products.map((row, i) => (i === index ? { ...row, unitCost: value } : row)),
    }));
  }

  /** Agrega un producto arriba de la lista, con su costo actual como punto de partida. */
  function addProduct(product: Product): void {
    setProductSearch('');
    setValues((current) => ({
      ...current,
      products: [{ productId: product.id, unitCost: product.cost }, ...current.products],
    }));
  }

  function removeRow(index: number): void {
    setValues((current) => ({
      ...current,
      products: current.products.filter((_, i) => i !== index),
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const found = validateSupplierForm(values);
    setErrors(found);

    if (!hasSupplierErrors(found)) {
      onSubmit(toSupplierPayload(values));
    }
  }

  const text = (field: TextField) => ({
    value: values[field],
    autoComplete: 'off',
    onChange: (event: ChangeEvent<HTMLInputElement>) => updateField(field, event.target.value),
  });

  return (
    <Modal
      title={mode === 'create' ? 'Nuevo proveedor' : 'Editar proveedor'}
      size="wide"
      onClose={() => {
        // Mientras se guarda no se cierra: el cambio podría quedar a medias.
        if (!busy) {
          onCancel();
        }
      }}
    >
      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="form__grid">
          <Field label="Nombre *" htmlFor="supplier-name">
            <input id="supplier-name" {...text('name')} />
            {errors.name === undefined ? null : <p className="form__error">{errors.name}</p>}
          </Field>
          <Field label="Persona de contacto" htmlFor="supplier-contact">
            <input id="supplier-contact" {...text('contactName')} />
          </Field>
          <Field label="Teléfono" htmlFor="supplier-phone">
            <input id="supplier-phone" type="tel" {...text('phone')} />
            {errors.contact === undefined ? null : <p className="form__error">{errors.contact}</p>}
          </Field>
          <Field label="Correo" htmlFor="supplier-email">
            <input id="supplier-email" type="email" {...text('email')} />
            {errors.email === undefined ? null : <p className="form__error">{errors.email}</p>}
          </Field>
          <Field label="Dirección" htmlFor="supplier-address">
            <input id="supplier-address" {...text('address')} />
          </Field>
          <Field label="Notas" htmlFor="supplier-notes">
            <input id="supplier-notes" {...text('notes')} />
          </Field>
        </div>

        {mode === 'create' ? (
          <p className="muted hint">
            Los productos se asocian después: al crear cada producto en Inventario se elige su
            proveedor principal. Si este proveedor también vende productos de otro principal,
            agréguelos al editarlo, con el costo que él cobra.
          </p>
        ) : (
          <>
            <h3 className="form__section-title">Productos que suministra</h3>
            <p className="muted hint">
              El proveedor principal se elige en Inventario. Aquí se agregan los demás productos que
              este proveedor también vende, con su costo, para poder pedírselos.
            </p>
            <ProductQuickSearch
              products={addable}
              label="Agregar producto que suministra"
              placeholder="Buscar un producto para agregarlo"
              onPick={addProduct}
            />
            {values.products.length > MODAL_PAGE_SIZE ? (
              <div className="toolbar">
                <ListSearch
                  value={productSearch}
                  onChange={setProductSearch}
                  placeholder="Buscar entre los que suministra"
                  label="Buscar entre los productos del proveedor"
                />
              </div>
            ) : null}
            {values.products.length > 0 && indexedRows.length === 0 ? (
              <p className="muted" role="status">
                Ninguno de sus productos coincide con «{productSearch.trim()}».
              </p>
            ) : null}
            {indexedRows.length === 0 ? null : (
              <div className="table-wrapper">
                <table className="table" aria-label="Productos que suministra">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Producto</th>
                      <th className="table__number">Costo unitario (₡)</th>
                      <th aria-label="Acciones" />
                    </tr>
                  </thead>
                  <tbody>
                    {pages.pageItems.map(({ row, index, product }) => {
                      const locked = lockedProductIds.includes(row.productId);
                      const name = product?.name ?? 'Producto no disponible';

                      return (
                        <tr key={row.productId}>
                          <td>{product?.code ?? '—'}</td>
                          <td>{name}</td>
                          <td className="table__number">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="input--money"
                              aria-label={`Costo de ${name}`}
                              value={row.unitCost}
                              onChange={(event) => updateCost(index, event.target.value)}
                            />
                          </td>
                          <td className="table__number">
                            {locked ? (
                              <span className="badge badge--ok" title="Se cambia desde Inventario">
                                Proveedor principal
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="button"
                                disabled={busy}
                                aria-label={`Quitar ${name}`}
                                onClick={() => removeRow(index)}
                              >
                                Quitar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination {...pages} itemLabel="productos" onPage={pages.setPage} />
            {values.products.length === 0 ? (
              <p className="muted">Sin productos asociados.</p>
            ) : null}
            {lockedProductIds.length === 0 ? null : (
              <p className="muted hint">
                Los productos marcados como «Proveedor principal» no se quitan aquí: el producto se
                quedaría sin proveedor. Para quitarlo, primero elija otro proveedor principal en
                Inventario (Modificar → General) y luego vuelva a esta ventana.
              </p>
            )}
            {errors.products === undefined ? null : (
              <p className="form__error">{errors.products}</p>
            )}
          </>
        )}

        {serverError === null ? null : <p className="form__error">{serverError}</p>}

        <div className="form__actions modal__actions">
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" className="button" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
