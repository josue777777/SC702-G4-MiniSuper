import { useState, type FormEvent } from 'react';
import { ApiError } from '../../services/api-client';
import { businessService } from '../../services/business.service';
import type { BusinessSettings } from '../../types/business';
import { fieldErrorsFromDetails, validateEmail } from '../auth/account-rules';
import { useBusiness } from '../business/business-context';

type Field = keyof BusinessSettings;
type Values = Record<Field, string>;

const FIELDS: { name: Field; label: string; hint?: string; maxLength: number; wide?: boolean }[] = [
  { name: 'name', label: 'Nombre del negocio', maxLength: 80, wide: true },
  { name: 'legalId', label: 'Cédula jurídica o física', maxLength: 30 },
  { name: 'phone', label: 'Teléfono', maxLength: 30 },
  { name: 'email', label: 'Correo del negocio', maxLength: 254 },
  { name: 'address', label: 'Dirección', maxLength: 200 },
  {
    name: 'receiptMessage',
    label: 'Mensaje al pie del comprobante',
    hint: 'Por ejemplo: «¡Gracias por su compra!». Déjelo vacío para no mostrar mensaje.',
    maxLength: 120,
    wide: true,
  },
];

function toValues(business: BusinessSettings): Values {
  return {
    name: business.name,
    legalId: business.legalId ?? '',
    phone: business.phone ?? '',
    email: business.email ?? '',
    address: business.address ?? '',
    receiptMessage: business.receiptMessage ?? '',
  };
}

/** Lo vacío viaja como `null`, igual que lo guarda el servidor. */
function toSettings(values: Values): BusinessSettings {
  const optional = (value: string) => (value.trim() === '' ? null : value.trim());

  return {
    name: values.name.trim(),
    legalId: optional(values.legalId),
    phone: optional(values.phone),
    email: optional(values.email),
    address: optional(values.address),
    receiptMessage: optional(values.receiptMessage),
  };
}

/**
 * Configuración › General: datos del negocio. Encabezan el comprobante de
 * venta y se ven en el menú y en el login. Solo el Administrador llega aquí.
 */
export function BusinessForm() {
  const { business, setBusiness } = useBusiness();
  const [values, setValues] = useState<Values>(() => toValues(business));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty = JSON.stringify(toSettings(values)) !== JSON.stringify(business);

  function validate(): Partial<Record<Field, string>> {
    const found: Partial<Record<Field, string>> = {};

    if (values.name.trim() === '') {
      found.name = 'Escriba el nombre del negocio.';
    }

    if (values.email.trim() !== '') {
      const emailError = validateEmail(values.email);

      if (emailError !== undefined) found.email = emailError;
    }

    if (values.phone.trim() !== '' && !/^[0-9+()\s-]{8,30}$/.test(values.phone.trim())) {
      found.phone = 'Solo números, espacios, +, - y paréntesis (mínimo 8).';
    }

    return found;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setNotice(null);

    const found = validate();

    setErrors(found);

    if (Object.keys(found).length > 0) {
      return;
    }

    setBusy(true);

    try {
      const saved = await businessService.update(toSettings(values));

      setBusiness(saved);
      setValues(toValues(saved));
      setNotice({ kind: 'success', text: 'Datos del negocio guardados.' });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(fieldErrorsFromDetails(caught.details));
      }

      setNotice({
        kind: 'error',
        text: caught instanceof ApiError ? caught.message : 'No se pudieron guardar los datos.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <p className="muted">
        Estos datos encabezan el comprobante de venta y se muestran en el menú y en el inicio de
        sesión.
      </p>

      {notice === null ? null : (
        <div
          className={`alert alert--${notice.kind}`}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </div>
      )}

      <div className="form__grid">
        {FIELDS.map((field) => (
          <div
            key={field.name}
            className={field.wide ? 'form__field form__field--wide' : 'form__field'}
          >
            <label htmlFor={`business-${field.name}`}>{field.label}</label>
            <input
              id={`business-${field.name}`}
              value={values[field.name]}
              maxLength={field.maxLength}
              type={field.name === 'email' ? 'email' : 'text'}
              aria-invalid={errors[field.name] !== undefined}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.name]: event.target.value }))
              }
            />
            {field.hint === undefined ? null : <small className="muted">{field.hint}</small>}
            {errors[field.name] === undefined ? null : (
              <p className="form__error">{errors[field.name]}</p>
            )}
          </div>
        ))}
      </div>

      <div className="form__actions">
        <button type="submit" className="button button--primary" disabled={busy || !dirty}>
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button
          type="button"
          className="button"
          disabled={busy || !dirty}
          onClick={() => {
            setValues(toValues(business));
            setErrors({});
            setNotice(null);
          }}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
