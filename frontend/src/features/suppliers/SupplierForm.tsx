import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
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
 * suministra, cada uno con su costo. Sirve para registrar y para editar.
 */
export function SupplierForm({
  mode,
  products,
  initialValues,
  lockedProductIds,
  busy,
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
    <section className="card">
      <header className="card__header">
        <h2>{mode === 'create' ? 'Nuevo proveedor' : 'Editar proveedor'}</h2>
      </header>

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

        <h3 className="form__section-title">Productos que suministra</h3>
        <p className="muted hint">
          Opcional al registrar: si todavía no hay productos, guarde el proveedor y asócielos
          después, al editarlo o al registrar cada producto.
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
                    disabled={busy || values.products.length === 1}
                    onClick={() => removeRow(index)}
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {errors.products === undefined ? null : <p className="form__error">{errors.products}</p>}
        <button type="button" className="button" onClick={addRow} disabled={busy}>
          + Agregar producto
        </button>

        <div className="form__actions">
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" className="button" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}
