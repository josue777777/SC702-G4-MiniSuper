import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Modal } from '../../components/Modal';
import type { Product } from '../../types/products';
import type { SupplierFormValues, SupplierPayload } from '../../types/suppliers';
import {
  EMPTY_PRODUCT_ROW,
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

  type TextField = Exclude<keyof SupplierFormValues, 'products'>;

  function updateField(field: TextField, value: string): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function updateRow(index: number, field: 'productId' | 'unitCost', value: string): void {
    setValues((current) => ({
      ...current,
      products: current.products.map((row, i) => {
        if (i !== index) {
          return row;
        }

        // Al elegir un producto se sugiere su costo actual como punto de partida.
        if (field === 'productId' && row.unitCost === '') {
          const product = products.find((candidate) => candidate.id === value);
          return { productId: value, unitCost: product?.cost ?? '' };
        }

        return { ...row, [field]: value };
      }),
    }));
  }

  function addRow(): void {
    setValues((current) => ({ ...current, products: [...current.products, EMPTY_PRODUCT_ROW] }));
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
            {values.products.map((row, index) => {
              const locked = lockedProductIds.includes(row.productId);

              return (
                <div className="form__grid supplier-row" key={index}>
                  <Field label="Producto" htmlFor={`supplier-product-${index}`}>
                    <select
                      id={`supplier-product-${index}`}
                      value={row.productId}
                      disabled={locked}
                      onChange={(event) => updateRow(index, 'productId', event.target.value)}
                    >
                      <option value="">Seleccione…</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.code} — {product.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Costo unitario (₡)" htmlFor={`supplier-cost-${index}`}>
                    <input
                      id={`supplier-cost-${index}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.unitCost}
                      onChange={(event) => updateRow(index, 'unitCost', event.target.value)}
                    />
                  </Field>
                  <div className="form__field supplier-row__action">
                    {locked ? (
                      <span className="badge badge--ok" title="Se cambia desde Inventario">
                        Proveedor principal
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="button"
                        disabled={busy}
                        onClick={() => removeRow(index)}
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
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
            <button type="button" className="button" onClick={addRow} disabled={busy}>
              + Agregar producto
            </button>
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
