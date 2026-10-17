import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Modal } from '../../components/Modal';
import type { ProductFormOptions, ProductFormValues, ProductPayload } from '../../types/products';
import { formatMoney } from './money';
import {
  describeMargin,
  hasErrors,
  toPayload,
  validateForm,
  type FormErrors,
} from './product-form';

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

type Tab = 'general' | 'costs' | 'stock' | 'labels';

const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'costs', label: 'Costos' },
  { id: 'stock', label: 'Existencias' },
  { id: 'labels', label: 'Etiquetas' },
];

/** Pestaña donde vive cada campo: si hay un error, se abre esa pestaña. */
const FIELD_TAB: Record<keyof ProductFormValues, Tab> = {
  code: 'general',
  name: 'general',
  categoryId: 'general',
  supplierId: 'general',
  price: 'costs',
  cost: 'costs',
  stock: 'stock',
};

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
 * Formulario de producto en una ventana modal con pestañas: sirve para
 * registrar (HU-01) y para editar (HU-02).
 *
 * Las pestañas solo esconden partes del MISMO formulario: todos los campos
 * siguen montados, así «Guardar» valida y envía todo junto. Si algo falla, se
 * abre la primera pestaña que tiene un error.
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
  const [tab, setTab] = useState<Tab>('general');

  const missingCategories = options.categories.length === 0;
  const missingSuppliers = options.suppliers.length === 0;
  const missingOptions = missingCategories || missingSuppliers;
  const margin = describeMargin(values.price, values.cost);

  function updateField(field: keyof ProductFormValues, value: string): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function tabHasErrors(id: Tab): boolean {
    return Object.entries(errors).some(
      ([field, message]) =>
        message !== undefined && FIELD_TAB[field as keyof ProductFormValues] === id,
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const found = validateForm(values);
    setErrors(found);

    if (hasErrors(found)) {
      const firstField = Object.keys(found)[0] as keyof ProductFormValues;
      setTab(FIELD_TAB[firstField]);

      return;
    }

    onSubmit(toPayload(values));
  }

  const input = (field: keyof ProductFormValues) => ({
    id: `product-${field}`,
    value: values[field],
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      updateField(field, event.target.value),
  });

  return (
    <Modal
      title={mode === 'create' ? 'Crear producto' : 'Modificar producto'}
      onClose={() => {
        if (!busy) {
          onCancel();
        }
      }}
    >
      {missingOptions ? (
        <p className="alert alert--warning">
          Para guardar un producto primero deben existir datos de apoyo.
          {missingCategories
            ? ' Todavía no hay categorías activas: cree una con la opción «+ Nueva categoría» del selector de categoría de la barra superior.'
            : ''}
          {missingSuppliers ? ' Todavía no hay proveedores activos.' : ''}
        </p>
      ) : null}

      <div className="tabs" role="tablist" aria-label="Secciones del producto">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`product-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`product-panel-${item.id}`}
            className={tab === item.id ? 'tabs__tab tabs__tab--active' : 'tabs__tab'}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {tabHasErrors(item.id) ? (
              <span className="tabs__error" aria-label="tiene errores">
                •
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <form className="form" onSubmit={handleSubmit} noValidate>
        <div
          className="tabs__panel"
          role="tabpanel"
          id="product-panel-general"
          aria-labelledby="product-tab-general"
          hidden={tab !== 'general'}
        >
          <div className="form__grid">
            <Field label="Nombre del producto" htmlFor="product-name" error={errors.name}>
              <input {...input('name')} autoComplete="off" />
            </Field>
            <Field label="Código" htmlFor="product-code" error={errors.code}>
              <input {...input('code')} autoComplete="off" />
            </Field>
            <Field label="Categoría" htmlFor="product-categoryId" error={errors.categoryId}>
              <select {...input('categoryId')} disabled={missingCategories}>
                <option value="">Seleccione…</option>
                {options.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Proveedor principal"
              htmlFor="product-supplierId"
              error={errors.supplierId}
            >
              <select {...input('supplierId')} disabled={missingSuppliers}>
                <option value="">Seleccione…</option>
                {options.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <div
          className="tabs__panel"
          role="tabpanel"
          id="product-panel-costs"
          aria-labelledby="product-tab-costs"
          hidden={tab !== 'costs'}
        >
          <div className="form__grid">
            <Field label="Costo (₡)" htmlFor="product-cost" error={errors.cost}>
              <input {...input('cost')} type="number" min="0" step="0.01" />
            </Field>
            <Field label="Precio de venta (₡)" htmlFor="product-price" error={errors.price}>
              <input {...input('price')} type="number" min="0" step="0.01" />
            </Field>
          </div>
          <dl className="order-meta product-margin">
            <div>
              <dt>Ganancia por unidad</dt>
              <dd>{margin === null ? '—' : formatMoney(margin.profit)}</dd>
            </div>
            <div>
              <dt>Margen sobre el precio</dt>
              <dd className={margin !== null && Number(margin.profit) < 0 ? 'text-error' : ''}>
                {margin === null ? '—' : `${margin.percent} %`}
              </dd>
            </div>
          </dl>
        </div>

        <div
          className="tabs__panel"
          role="tabpanel"
          id="product-panel-stock"
          aria-labelledby="product-tab-stock"
          hidden={tab !== 'stock'}
        >
          <div className="form__grid">
            <Field
              label={mode === 'create' ? 'Stock inicial' : 'Existencias'}
              htmlFor="product-stock"
              error={errors.stock}
            >
              <input {...input('stock')} type="number" min="0" step="1" />
            </Field>
          </div>
          <p className="muted hint">
            {mode === 'create'
              ? 'Queda registrado como la entrada inicial del producto en el Kardex.'
              : 'Si cambia esta cantidad, la diferencia queda registrada como un ajuste en el Kardex. Para el día a día use el «Conteo físico».'}{' '}
            El stock mínimo y la fecha de vencimiento se definen en «Mínimos y vencimientos».
          </p>
        </div>

        <div
          className="tabs__panel"
          role="tabpanel"
          id="product-panel-labels"
          aria-labelledby="product-tab-labels"
          hidden={tab !== 'labels'}
        >
          <p className="muted">
            Aquí se generará el código de barras imprimible del producto (HU-07, pendiente).
          </p>
        </div>

        <div className="form__actions modal__actions">
          <button
            type="submit"
            className="button button--primary"
            disabled={busy || missingOptions}
          >
            {busy ? 'Guardando…' : mode === 'create' ? '✓ Crear producto' : '✓ Guardar cambios'}
          </button>
          <button type="button" className="button" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
