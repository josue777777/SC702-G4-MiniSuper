import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { Supplier, SupplierFormValues } from '../../types/suppliers';
import {
  EMPTY_SUPPLIER_VALUES,
  hasSupplierErrors,
  toSupplierPayload,
  validateSupplierForm,
  type SupplierFormErrors,
} from './supplier-form';
import { useQuickSupplierForm } from './use-quick-supplier-form';

interface QuickSupplierFormProps {
  /**
   * Se llama tras guardar con el proveedor creado, para que la pantalla
   * refresque sus opciones y lo deje seleccionado en el producto.
   */
  onCreated: (supplier: Supplier) => Promise<void>;
  onClose: () => void;
}

type QuickValues = Pick<SupplierFormValues, 'name' | 'contactName' | 'phone' | 'email'>;

const EMPTY: QuickValues = { name: '', contactName: '', phone: '', email: '' };

/**
 * Alta rápida de proveedor (HU-21) dentro del modal de producto, igual que la
 * de categoría: se registra sin salir del formulario, así no se pierde lo que
 * ya se escribió del producto.
 *
 * Pide solo lo necesario (nombre y un contacto). La dirección, las notas y los
 * productos que suministra se completan después en Proveedores. Usa las mismas
 * reglas que el formulario completo (`supplier-form.ts`), y el servidor las
 * vuelve a validar. El envío y los errores viven en `use-quick-supplier-form.ts`,
 * igual que en la categoría (`CategoryForm` + `use-category-form.ts`).
 */
export function QuickSupplierForm({ onCreated, onClose }: QuickSupplierFormProps) {
  const { busy, error, existing, listError, create, showExisting, hideExisting } =
    useQuickSupplierForm(onCreated);
  const [values, setValues] = useState<QuickValues>(EMPTY);
  const [errors, setErrors] = useState<SupplierFormErrors>({});

  function update(field: keyof QuickValues) {
    return (event: ChangeEvent<HTMLInputElement>) =>
      setValues((current) => ({ ...current, [field]: event.target.value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    // No debe enviar el formulario del producto que la contiene.
    event.preventDefault();
    event.stopPropagation();

    const full: SupplierFormValues = { ...EMPTY_SUPPLIER_VALUES, ...values };
    const found = validateSupplierForm(full);

    setErrors(found);

    if (hasSupplierErrors(found)) {
      return;
    }

    // Solo se cierra si se guardó: ante un nombre repetido queda abierto con el error.
    if (await create(toSupplierPayload(full))) {
      onClose();
    }
  }

  return (
    <section className="card">
      <header className="card__header">
        <h2>Nuevo proveedor</h2>
      </header>

      <form className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="form__grid">
          <div className="form__field">
            <label htmlFor="quick-supplier-name">Nombre</label>
            <input
              id="quick-supplier-name"
              value={values.name}
              maxLength={120}
              autoComplete="off"
              onChange={update('name')}
            />
            {errors.name === undefined ? null : <p className="form__error">{errors.name}</p>}
          </div>

          <div className="form__field">
            <label htmlFor="quick-supplier-contact">Persona de contacto (opcional)</label>
            <input
              id="quick-supplier-contact"
              value={values.contactName}
              maxLength={120}
              autoComplete="off"
              onChange={update('contactName')}
            />
          </div>

          <div className="form__field">
            <label htmlFor="quick-supplier-phone">Teléfono</label>
            <input
              id="quick-supplier-phone"
              type="tel"
              value={values.phone}
              maxLength={30}
              autoComplete="off"
              onChange={update('phone')}
            />
          </div>

          <div className="form__field">
            <label htmlFor="quick-supplier-email">Correo</label>
            <input
              id="quick-supplier-email"
              type="email"
              value={values.email}
              maxLength={120}
              autoComplete="off"
              onChange={update('email')}
            />
            {errors.email === undefined ? null : <p className="form__error">{errors.email}</p>}
          </div>
        </div>

        {errors.contact === undefined ? (
          <p className="muted">Indique al menos un dato de contacto: teléfono o correo.</p>
        ) : (
          <p className="form__error">{errors.contact}</p>
        )}

        {error === null ? null : (
          <div className="form__error-row" role="alert">
            <p className="form__error">{error.message}</p>
            {error.duplicate ? (
              <button type="button" className="button" onClick={() => void showExisting()}>
                Ver proveedores existentes
              </button>
            ) : null}
          </div>
        )}

        {listError === null ? null : <p className="form__error">{listError}</p>}

        {existing === null ? null : (
          <div>
            <p className="muted">
              Proveedores existentes ({existing.length}){' '}
              <button type="button" className="button" onClick={hideExisting}>
                Ocultar
              </button>
            </p>
            <ul className="category-list">
              {existing.map((supplier) => (
                <li key={supplier.id}>
                  {supplier.name}
                  {supplier.isActive ? '' : ' (inactivo)'}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="muted">
          La dirección, las notas y los productos que suministra se pueden completar después en
          Proveedores.
        </p>

        <div className="form__actions">
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" className="button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}
