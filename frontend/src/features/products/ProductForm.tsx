import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Modal } from '../../components/Modal';
import { useSession } from '../auth/session-context';
import { CategoryForm } from '../categories/CategoryForm';
import { QuickSupplierForm } from '../suppliers/QuickSupplierForm';
import { parseMinStock, todayDateOnly } from '../inventory/inventory-count';
import { productsService } from '../../services/products.service';
import {
  MAX_PRODUCT_IMAGE_BYTES,
  PRODUCT_IMAGE_TYPES,
  type ProductFormOptions,
  type ProductFormValues,
  type ProductImageChange,
  type ProductPayload,
  type ProductSettingsChange,
} from '../../types/products';
import { formatMoney } from './money';
import { ean13Modules, generateEan13 } from './barcode';
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
  /** Recarga las opciones tras registrar un proveedor desde el modal (HU-21). */
  onSupplierCreated?: () => Promise<void>;
  /** Imagen guardada del producto (HU-01); `null` si no tiene o es un alta. */
  imageUrl?: string | null;
  /** Código EAN-13 persistido, si ya se generó. */
  initialBarcode?: string | null;
  /** Mínimo (HU-08) y vencimiento (HU-09) guardados; en un alta, 0 y sin fecha. */
  initialMinStock?: number;
  initialExpirationDate?: string | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (
    payload: ProductPayload,
    image: ProductImageChange,
    settings: ProductSettingsChange,
  ) => void;
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
  initialBarcode = null,
  initialMinStock = 0,
  initialExpirationDate = null,
  onCategoryCreated,
  onSupplierCreated,
  busy,
  onCancel,
  onSubmit,
}: ProductFormProps) {
  /** Registrar proveedores exige el permiso de compras; sin él, no se ofrece. */
  const canCreateSupplier = useSession().can('purchasing');
  const [values, setValues] = useState<ProductFormValues>(initialValues);
  const [barcode, setBarcode] = useState(initialBarcode ?? '');
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  /** Pide confirmar antes de reemplazar un código ya guardado (HU-07). */
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [tab, setTab] = useState<Tab>('general');
  /** Mínimo y vencimiento: se guardan con los endpoints de HU-08 y HU-09. */
  const [minStock, setMinStock] = useState(String(initialMinStock));
  const [expirationDate, setExpirationDate] = useState(initialExpirationDate ?? '');
  const [settingsErrors, setSettingsErrors] = useState<{
    minStock?: string;
    expirationDate?: string;
  }>({});
  const today = todayDateOnly();

  /** Alta de categoría sin salir del modal (HU-04). */
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  /** Cambio de imagen pendiente: se aplica al guardar, no al elegir el archivo. */
  const [image, setImage] = useState<ProductImageChange>({ kind: 'keep' });
  const [imageError, setImageError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const barcodeRef = useRef<SVGSVGElement>(null);
  const qrRef = useRef<SVGSVGElement>(null);

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
    if (id === 'stock' && Object.keys(settingsErrors).length > 0) {
      return true;
    }

    return Object.entries(errors).some(
      ([field, message]) =>
        message !== undefined && FIELD_TAB[field as keyof ProductFormValues] === id,
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const found = validateForm(values);
    setErrors(found);

    // Mismas reglas que el backend de HU-08 y HU-09.
    const parsedMin = parseMinStock(minStock);
    const foundSettings: { minStock?: string; expirationDate?: string } = {};

    if (!parsedMin.ok) {
      foundSettings.minStock = parsedMin.error;
    }

    if (expirationDate !== '' && expirationDate < today) {
      foundSettings.expirationDate = 'La fecha de vencimiento no puede ser anterior a hoy.';
    }

    setSettingsErrors(foundSettings);

    if (hasErrors(found)) {
      const firstField = Object.keys(found)[0] as keyof ProductFormValues;
      setTab(FIELD_TAB[firstField]);

      return;
    }

    if (!parsedMin.ok || foundSettings.expirationDate !== undefined) {
      setTab('stock');

      return;
    }

    // Solo viaja lo que cambió: si no se tocó, no se llama a la API.
    const settings: ProductSettingsChange = {};
    const nextExpiration = expirationDate === '' ? null : expirationDate;

    if (parsedMin.quantity !== initialMinStock) {
      settings.minStock = parsedMin.quantity;
    }

    if (nextExpiration !== initialExpirationDate) {
      settings.expirationDate = nextExpiration;
    }

    const payload = toPayload(values);
    if (barcode !== '') {
      payload.barcode = barcode;
    }

    onSubmit(payload, image, settings);
  }

  const input = (field: keyof ProductFormValues) => ({
    id: `product-${field}`,
    value: values[field],
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      updateField(field, event.target.value),
  });
  const qrValue = barcode || values.code.trim();

  function downloadSvg(filename: string, svg: SVGSVGElement | null): void {
    if (svg === null) {
      return;
    }

    const content = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(new Blob([content], { type: 'image/svg+xml;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function createBarcode(): void {
    try {
      setBarcode(generateEan13());
      setBarcodeError(null);
      setConfirmingReplace(false);
    } catch {
      setBarcodeError('No se pudo generar el código. Use una conexión segura e intente de nuevo.');
    }
  }

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
            {missingSuppliers
              ? canCreateSupplier
                ? ' Todavía no hay proveedores activos: registre uno con «+ Nuevo proveedor», junto al campo Proveedor.'
                : ' Todavía no hay proveedores activos: pídale a quien maneja las compras que registre uno.'
              : ''}
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

      {/* Igual que la categoría: alta rápida sin salir; al guardar queda seleccionado. */}
      {supplierFormOpen ? (
        <div className="modal__subform">
          <QuickSupplierForm
            onCreated={async (supplier) => {
              await onSupplierCreated?.();
              updateField('supplierId', supplier.id);
            }}
            onClose={() => setSupplierFormOpen(false)}
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
                {canCreateSupplier ? (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setSupplierFormOpen(true)}
                    disabled={busy || supplierFormOpen}
                  >
                    + Nuevo proveedor
                  </button>
                ) : null}
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
            <Field
              label="Stock mínimo (0 = sin alerta)"
              htmlFor="product-minStock"
              error={settingsErrors.minStock}
            >
              <input
                id="product-minStock"
                type="number"
                min="0"
                step="1"
                value={minStock}
                onChange={(event) => setMinStock(event.target.value)}
              />
            </Field>
            <Field
              label="Fecha de vencimiento (opcional)"
              htmlFor="product-expirationDate"
              error={settingsErrors.expirationDate}
            >
              <div className="field-with-action">
                <input
                  id="product-expirationDate"
                  type="date"
                  min={today}
                  value={expirationDate}
                  onChange={(event) => setExpirationDate(event.target.value)}
                />
                {expirationDate === '' ? null : (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setExpirationDate('')}
                  >
                    Quitar fecha (no vence)
                  </button>
                )}
              </div>
            </Field>
          </div>
          <p className="muted hint">
            {mode === 'create'
              ? 'El stock inicial queda registrado como la entrada del producto en Movimientos.'
              : 'Si cambia las existencias, la diferencia queda registrada como un ajuste en Movimientos. Para el día a día use el «Conteo físico».'}{' '}
            Con un mínimo mayor que 0, el panel avisa cuando el stock llega a ese nivel (HU-08); la
            fecha de vencimiento activa las alertas de vencidos y por vencer (HU-09).
          </p>
        </div>

        <div
          className="tabs__panel"
          role="tabpanel"
          id="product-panel-labels"
          aria-labelledby="product-tab-labels"
          hidden={tab !== 'labels'}
        >
          <div className="label-preview-grid">
            <section className="label-preview" aria-labelledby="product-barcode-title">
              <h3 id="product-barcode-title">Código de barras EAN-13</h3>
              {barcode === '' ? (
                <p className="muted">Todavía no tiene. Use «Generar códigos».</p>
              ) : (
                <>
                  <svg
                    ref={barcodeRef}
                    className="label-preview__barcode"
                    viewBox="0 0 113 50"
                    role="img"
                    aria-label={`Código de barras ${barcode}`}
                  >
                    <rect width="113" height="50" fill="white" />
                    {Array.from(ean13Modules(barcode)).map((module, index) =>
                      module === '1' ? (
                        <rect key={index} x={index + 9} y="0" width="1" height="50" />
                      ) : null,
                    )}
                  </svg>
                  <p className="label-preview__code">{barcode}</p>
                  <button
                    type="button"
                    className="button"
                    onClick={() => downloadSvg(`codigo-barras-${barcode}.svg`, barcodeRef.current)}
                  >
                    Descargar código de barras
                  </button>
                </>
              )}
            </section>
            <section className="label-preview" aria-labelledby="product-qr-title">
              <h3 id="product-qr-title">Código QR</h3>
              {qrValue === '' ? (
                <p className="muted">Ingrese el código del producto para generar su QR.</p>
              ) : (
                <>
                  <QRCodeSVG
                    ref={qrRef}
                    value={qrValue}
                    size={180}
                    level="M"
                    includeMargin
                    title={`Código QR del producto ${values.name || values.code}`}
                  />
                  <p className="muted">
                    Contenido: {barcode === '' ? `código ${values.code}` : `EAN-13 ${barcode}`}
                  </p>
                  <button
                    type="button"
                    className="button"
                    onClick={() =>
                      downloadSvg(
                        `codigo-qr-${values.code.trim() || 'producto'}.svg`,
                        qrRef.current,
                      )
                    }
                  >
                    Descargar código QR
                  </button>
                </>
              )}
            </section>
          </div>

          {/*
            Generar y reemplazar van al centro, debajo de los DOS códigos, porque afectan a
            los dos: el QR guarda el mismo número que el código de barras (si no hay código
            de barras, guarda el código del producto).
          */}
          <section className="label-preview" aria-label="Generar o reemplazar los códigos">
            <p className="muted">
              El QR lleva el mismo número que el código de barras: al generarlos o reemplazarlos,
              cambian los dos.
              {barcode !== '' && barcode !== initialBarcode
                ? ' Se guardarán al guardar el producto.'
                : ''}
            </p>
            {/*
              HU-07: antes de reemplazar un código YA GUARDADO se advierte, porque las
              etiquetas impresas con el código viejo dejan de servir. Uno recién generado
              (aún sin guardar) se puede cambiar sin preguntar.
            */}
            {confirmingReplace ? (
              <>
                <p className="alert alert--warning" role="alert">
                  Si los reemplaza, el código {barcode} y su QR dejarán de identificar este producto
                  y las etiquetas impresas con ellos ya no servirán.
                </p>
                <div className="form__actions">
                  <button
                    type="button"
                    className="button button--danger-solid"
                    onClick={createBarcode}
                    disabled={busy}
                  >
                    Sí, reemplazar códigos
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => setConfirmingReplace(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="button button--dark"
                disabled={busy}
                onClick={() =>
                  barcode !== '' && barcode === initialBarcode
                    ? setConfirmingReplace(true)
                    : createBarcode()
                }
              >
                {barcode === ''
                  ? 'Generar códigos'
                  : barcode === initialBarcode
                    ? 'Reemplazar códigos'
                    : 'Generar otros'}
              </button>
            )}
            {barcodeError === null ? null : (
              <p className="form__error" role="alert">
                {barcodeError}
              </p>
            )}
          </section>
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
