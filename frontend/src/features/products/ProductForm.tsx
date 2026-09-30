import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import type { ProductFormOptions, ProductFormValues, ProductPayload } from '../../types/products';
import { hasErrors, toPayload, validateForm, type FormErrors } from './product-form';

interface ProductFormProps {
  /** `create` registra (HU-01); `edit` guarda cambios (HU-02). */
  mode: 'create' | 'edit';
  options: ProductFormOptions;
  /** Valores con los que abre: vacíos, o los persistidos del producto a editar. */
  initialValues: ProductFormValues;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (payload: ProductPayload) => void;
}

/** Campo con su etiqueta y su error, para no repetir el bloque en cada control. */
function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="form__field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error === undefined ? null : <p className="form__error">{error}</p>}
    </div>
  );
}

/**
 * Formulario de producto: sirve para registrar (HU-01) y para editar (HU-02).
 *
 * El estado vive AQUÍ y se inicializa con `initialValues` al montar. La pantalla
 * monta el formulario con una `key` distinta según el producto, de modo que
 * abrirlo siempre parte de los datos guardados: si el dueño cancela, lo escrito
 * se descarta y no queda nada en memoria.
 *
 * Los `<select>` se llenan con lo que devuelve `GET /api/products/form-options`:
 * no hay categorías ni proveedores escritos en el código.
 */
export function ProductForm({
  mode,
  options,
  initialValues,
  busy,
  onCancel,
  onSubmit,
}: ProductFormProps) {
  const [values, setValues] = useState<ProductFormValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});

  const missingCategories = options.categories.length === 0;
  const missingSuppliers = options.suppliers.length === 0;
  const missingOptions = missingCategories || missingSuppliers;

  function updateField(field: keyof ProductFormValues, value: string): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const found = validateForm(values);
    setErrors(found);

    if (hasErrors(found)) {
      return;
    }

    onSubmit(toPayload(values));
  }

  return (
    <section className="card">
      <header className="card__header">
        <h2>{mode === 'create' ? 'Nuevo producto' : 'Editar producto'}</h2>
      </header>

      {missingOptions ? (
        <p className="alert alert--warning">
          Para guardar un producto primero deben existir datos de apoyo.
          {missingCategories ? ' Todavía no hay categorías activas (se crean en HU-04).' : ''}
          {missingSuppliers ? ' Todavía no hay proveedores activos.' : ''}
        </p>
      ) : null}

      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="form__grid">
          <Field label="Código" htmlFor="product-code" error={errors.code}>
            <input
              id="product-code"
              value={values.code}
              autoComplete="off"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateField('code', event.target.value)
              }
            />
          </Field>

          <Field label="Nombre" htmlFor="product-name" error={errors.name}>
            <input
              id="product-name"
              value={values.name}
              autoComplete="off"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateField('name', event.target.value)
              }
            />
          </Field>

          <Field label="Categoría" htmlFor="product-category" error={errors.categoryId}>
            <select
              id="product-category"
              value={values.categoryId}
              disabled={missingCategories}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                updateField('categoryId', event.target.value)
              }
            >
              <option value="">Seleccione…</option>
              {options.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Proveedor" htmlFor="product-supplier" error={errors.supplierId}>
            <select
              id="product-supplier"
              value={values.supplierId}
              disabled={missingSuppliers}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                updateField('supplierId', event.target.value)
              }
            >
              <option value="">Seleccione…</option>
              {options.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Precio de venta" htmlFor="product-price" error={errors.price}>
            <input
              id="product-price"
              type="number"
              min="0"
              step="0.01"
              value={values.price}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateField('price', event.target.value)
              }
            />
          </Field>

          <Field label="Costo" htmlFor="product-cost" error={errors.cost}>
            <input
              id="product-cost"
              type="number"
              min="0"
              step="0.01"
              value={values.cost}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateField('cost', event.target.value)
              }
            />
          </Field>

          <Field label="Stock" htmlFor="product-stock" error={errors.stock}>
            <input
              id="product-stock"
              type="number"
              min="0"
              step="1"
              value={values.stock}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateField('stock', event.target.value)
              }
            />
          </Field>
        </div>

        <div className="form__actions">
          <button
            type="submit"
            className="button button--primary"
            disabled={busy || missingOptions}
          >
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
