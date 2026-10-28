import { useState, type FormEvent } from 'react';
import { ApiError } from '../../services/api-client';
import { businessService } from '../../services/business.service';
import type { Business, BusinessSettings } from '../../types/business';
import { fieldErrorsFromDetails, validateEmail } from '../auth/account-rules';
import { useSession } from '../auth/session-context';
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

function toValues(business: Business): Values {
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
 * Configuración › General: datos, logo y plan del negocio. Encabezan el
 * comprobante de venta y se ven en el menú y en el login. Llegan aquí el
 * Administrador y el Encargado; el plan solo lo cambia el Administrador.
 */
export function BusinessForm() {
  return (
    <>
      <BusinessDataForm />
      <LogoField />
      <PlanSection />
    </>
  );
}

function BusinessDataForm() {
  const { business, setBusiness } = useBusiness();
  const [values, setValues] = useState<Values>(() => toValues(business));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Solo los campos de este formulario: el logo y el plan se guardan aparte.
  const dirty =
    JSON.stringify(toSettings(values)) !== JSON.stringify(toSettings(toValues(business)));

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

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_LOGO_BYTES = 1024 * 1024;

/** Logo del negocio: se ve en el menú, el login y el comprobante. */
function LogoField() {
  const { business, setBusiness } = useBusiness();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function run(action: () => Promise<Business>, success: string): Promise<void> {
    setBusy(true);
    setNotice(null);

    try {
      setBusiness(await action());
      setNotice({ kind: 'success', text: success });
    } catch (caught) {
      setNotice({
        kind: 'error',
        text: caught instanceof ApiError ? caught.message : 'No se pudo guardar el logo.',
      });
    } finally {
      setBusy(false);
    }
  }

  function handleFile(file: File | undefined): void {
    if (file === undefined) {
      return;
    }

    // Lo mismo que revisa el servidor, para avisar antes de subir.
    if (!LOGO_TYPES.includes(file.type)) {
      setNotice({ kind: 'error', text: 'Solo se aceptan imágenes PNG, JPG o WEBP.' });
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      setNotice({ kind: 'error', text: 'El logo supera el máximo de 1 MB.' });
      return;
    }

    void run(() => businessService.uploadLogo(file), 'Logo actualizado.');
  }

  return (
    <section className="form" aria-labelledby="logo-title">
      <h3 id="logo-title" className="form__section-title">
        Logo
      </h3>

      {notice === null ? null : (
        <div
          className={`alert alert--${notice.kind}`}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </div>
      )}

      <div className="logo-field">
        {business.logoUrl === null ? (
          <span className="logo-field__preview" aria-label="Sin logo" />
        ) : (
          <img
            className="business-logo logo-field__preview"
            src={businessService.logoSrc(business.logoUrl)}
            alt="Logo actual del negocio"
          />
        )}
        <label className="button">
          {business.logoUrl === null ? 'Seleccionar logo' : 'Cambiar logo'}
          <input
            type="file"
            accept={LOGO_TYPES.join(',')}
            hidden
            disabled={busy}
            aria-label="Archivo del logo"
            onChange={(event) => {
              handleFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>
        {business.logoUrl === null ? null : (
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => void run(() => businessService.removeLogo(), 'Logo quitado.')}
          >
            Quitar logo
          </button>
        )}
        <small className="muted">PNG, JPG o WEBP de hasta 1 MB. Mejor si es cuadrado.</small>
      </div>
    </section>
  );
}

/**
 * Plan contratado: cuántos usuarios activos permite. Todos los que llegan aquí
 * ven el uso; solo el Administrador de la plataforma cambia el límite.
 */
function PlanSection() {
  const { can } = useSession();
  const { business, setBusiness } = useBusiness();
  const { maxUsers, usedSeats } = business.plan;
  const [limit, setLimit] = useState(String(maxUsers));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const value = Number(limit);

    if (!Number.isInteger(value) || value < 1 || value > 500) {
      setNotice({ kind: 'error', text: 'Escriba un número entero de 1 a 500.' });
      return;
    }

    setBusy(true);
    setNotice(null);

    try {
      const saved = await businessService.updatePlan(value);

      setBusiness(saved);
      setNotice({ kind: 'success', text: 'Plan actualizado.' });
    } catch (caught) {
      setNotice({
        kind: 'error',
        text: caught instanceof ApiError ? caught.message : 'No se pudo actualizar el plan.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="form" aria-labelledby="plan-title">
      <h3 id="plan-title" className="form__section-title">
        Plan contratado
      </h3>
      <p className="plan-usage">
        Usuarios activos: <strong>{usedSeats}</strong> de <strong>{maxUsers}</strong>{' '}
        <small className="muted">(los administradores de la plataforma no cuentan)</small>
      </p>

      {notice === null ? null : (
        <div
          className={`alert alert--${notice.kind}`}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </div>
      )}

      {can('plan.manage') ? (
        <form className="form__actions" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <label htmlFor="plan-max-users">Límite de usuarios</label>
          <input
            id="plan-max-users"
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
          />
          <button
            type="submit"
            className="button button--primary"
            disabled={busy || Number(limit) === maxUsers}
          >
            {busy ? 'Guardando…' : 'Cambiar límite'}
          </button>
        </form>
      ) : (
        <p className="muted">
          Para tener más usuarios, pida al administrador de la plataforma ampliar el plan.
        </p>
      )}
    </section>
  );
}
