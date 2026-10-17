import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../../components/Modal';
import { CategoryForm } from '../categories/CategoryForm';
import { productsService } from '../../services/products.service';
import {
  MAX_PRODUCT_IMAGE_BYTES,
  PRODUCT_IMAGE_TYPES,
  type ProductFormOptions,
  type ProductFormValues,
  type ProductImageChange,
  type ProductPayload,
} from '../../types/products';
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
  /** Recarga las opciones tras crear una categoría desde el modal (HU-04). */
  onCategoryCreated?: () => Promise<void>;
  /** Imagen guardada del producto (HU-01); `null` si no tiene o es un alta. */
  imageUrl?: string | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (payload: ProductPayload, image: ProductImageChange) => void;
}

type Tab = 'general' | 'costs' | 'stock' | 'labels' | 'image';

const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'costs', label: 'Precios' },
  { id: 'stock', label: 'Existencias' },
  { id: 'labels', label: 'Etiquetas' },
  { id: 'image', label: 'Imagen' },
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
  imageUrl = null,
  onCategoryCreated,
  busy,
  onCancel,
  onSubmit,
}: ProductFormProps) {
  const [values, setValues] = useState<ProductFormValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [tab, setTab] = useState<Tab>('general');
  /** Alta de categoría sin salir del modal (HU-04). */
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  /** Cambio de imagen pendiente: se aplica al guardar, no al elegir el archivo. */
  const [image, setImage] = useState<ProductImageChange>({ kind: 'keep' });
  const [imageError, setImageError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Vista previa del archivo elegido. La URL temporal se libera al cambiarlo o
  // al cerrar el modal, para no dejar memoria ocupada en el navegador.
  useEffect(() => {
    if (image.kind !== 'set') {
      setPreviewUrl(null);

      return;
    }

    const url = URL.createObjectURL(image.file);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [image]);

  const shownImage =
    image.kind === 'set'
      ? previewUrl
      : image.kind === 'remove' || imageUrl === null
        ? null
        : productsService.imageSrc(imageUrl);

  /** Revisa el archivo antes de aceptarlo; el backend lo vuelve a revisar. */
  function chooseImage(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (file === undefined) {
      return;
    }

    if (!PRODUCT_IMAGE_TYPES.includes(file.type)) {
      setImageError('Solo se aceptan imágenes PNG, JPG o WEBP.');

      return;
    }

    if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
      setImageError('La imagen supera el máximo de 2 MB.');

      return;
    }

    setImageError(null);
    setImage({ kind: 'set', file });
  }

  function removeImage(): void {
    setImageError(null);
    setImage(imageUrl === null ? { kind: 'keep' } : { kind: 'remove' });
  }

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

    onSubmit(toPayload(values), image);
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
          <span>
            Para guardar un producto primero deben existir datos de apoyo.
            {missingCategories
              ? ' Todavía no hay categorías: cree una con «+ Nueva categoría», junto al campo Categoría.'
              : ''}
            {missingSuppliers ? (
              <>
                {' Todavía no hay proveedores activos: '}
                <Link to="/suppliers">registre uno en Proveedores</Link> (este formulario se
                cierra).
              </>
            ) : null}
          </span>
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

      {/*
       * Fuera del <form> del producto: un formulario no puede ir dentro de otro.
       * Al guardarla, la categoría nueva queda seleccionada en el producto.
       */}
      {categoryFormOpen ? (
        <div className="modal__subform">
          <CategoryForm
            onCreated={async (category) => {
              await onCategoryCreated?.();
              updateField('categoryId', category.id);
            }}
            onClose={() => setCategoryFormOpen(false)}
          />
        </div>
      ) : null}

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
              <div className="field-with-action">
                <select {...input('categoryId')}>
                  <option value="">Seleccione…</option>
                  {options.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setCategoryFormOpen(true)}
                  disabled={busy || categoryFormOpen}
                >
                  + Nueva categoría
                </button>
              </div>
            </Field>
            <Field
              label="Proveedor principal"
              htmlFor="product-supplierId"
              error={errors.supplierId}
            >
              <div className="field-with-action">
                <select {...input('supplierId')} disabled={missingSuppliers}>
                  <option value="">Seleccione…</option>
                  {options.suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
                {/* El formulario de proveedor es grande (contactos y productos): se registra en su pantalla. */}
                <Link to="/suppliers" className="link-button">
                  + Nuevo proveedor (en Proveedores)
                </Link>
              </div>
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
            <Field label="Precio de compra (₡)" htmlFor="product-cost" error={errors.cost}>
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
          {/* Espacio reservado: se completa en la rama de HU-07. */}
          <div className="reserved-grid">
            <div className="reserved-box">
              <strong>Código de barras</strong>
              <span className="reserved-box__art" aria-hidden="true">
                ▌▍▌▌▍▌▍▍▌▌▍▌
              </span>
              <p className="muted">
                Generar un código único, imprimirlo o descargarlo (HU-07, pendiente).
              </p>
            </div>
            <div className="reserved-box">
              <strong>Código QR</strong>
              <span className="reserved-box__art" aria-hidden="true">
                ▦
              </span>
              <p className="muted">Descargar el QR del producto (HU-07, pendiente).</p>
            </div>
          </div>
        </div>

        <div
          className="tabs__panel"
          role="tabpanel"
          id="product-panel-image"
          aria-labelledby="product-tab-image"
          hidden={tab !== 'image'}
        >
          <div className="image-field">
            <div className="image-field__preview">
              {shownImage === null ? (
                <span className="reserved-box__art" aria-hidden="true">
                  ◫
                </span>
              ) : (
                <img src={shownImage} alt={`Imagen de ${values.name || 'el producto'}`} />
              )}
            </div>
            <div className="image-field__actions">
              <strong>Imagen del producto (opcional)</strong>
              <p className="muted hint">
                PNG, JPG o WEBP de hasta 2 MB. Se muestra en la ficha del producto.
              </p>
              <label className="button button--tool image-field__choose">
                {shownImage === null ? 'Elegir imagen' : 'Cambiar imagen'}
                <input
                  type="file"
                  accept={PRODUCT_IMAGE_TYPES.join(',')}
                  onChange={chooseImage}
                  disabled={busy}
                />
              </label>
              {shownImage === null ? null : (
                <button type="button" className="button" onClick={removeImage} disabled={busy}>
                  Quitar imagen
                </button>
              )}
              {image.kind === 'set' ? (
                <p className="muted hint">
                  Nueva imagen: {image.file.name}. Se guarda con el producto.
                </p>
              ) : null}
              {image.kind === 'remove' ? (
                <p className="muted hint">La imagen se quitará al guardar.</p>
              ) : null}
              {imageError === null ? null : <p className="form__error">{imageError}</p>}
            </div>
          </div>
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
