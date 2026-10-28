import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import { ApiError } from '../../services/api-client';
import { businessService } from '../../services/business.service';
import { planRequestsService } from '../../services/platform.service';
import type { Business, BusinessSettings } from '../../types/business';
import type { OwnPlanRequests } from '../../types/platform';
import { RequestStatusBadge } from '../platform/RequestStatusBadge';
import { formatMoney } from '../products/money';
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
 * Configuración › General (solo el Encargado): datos, logo y plan de SU
 * negocio. El nombre y el logo se ven en el menú y encabezan el comprobante;
 * el nombre del sistema es de la plataforma y no se cambia aquí.
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
        Estos datos encabezan el comprobante de venta y el nombre se muestra en el menú, debajo del
        nombre del sistema.
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
 * Plan del negocio: Encargado + N usuarios adicionales. El Encargado ve el uso
 * y pide más usuarios a la plataforma; el Administrador aprueba o rechaza la
 * solicitud y, al aprobarla, el Encargado ya puede crear los usuarios.
 */
function PlanSection() {
  const { business, reload } = useBusiness();
  const { extraUsers, maxUsers, usedSeats } = business.plan;
  const [own, setOwn] = useState<OwnPlanRequests | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const pending = own?.requests.some((request) => request.status === 'PENDING') ?? false;

  const loadOwn = useCallback(async (): Promise<void> => {
    try {
      setOwn(await planRequestsService.listOwn());
    } catch {
      // Sin historial: el plan igual se ve.
    }
  }, []);

  useEffect(() => {
    void loadOwn();
  }, [loadOwn]);

  return (
    <section className="form" aria-labelledby="plan-title">
      <h3 id="plan-title" className="form__section-title">
        Plan contratado
      </h3>
      <p className="plan-usage">
        Usuarios activos: <strong>{usedSeats}</strong> de <strong>{maxUsers}</strong>{' '}
        <small className="muted">
          (plan: Encargado{extraUsers > 0 ? ` + ${extraUsers}` : ' solamente'})
        </small>
      </p>

      {notice === null ? null : (
        <div
          className={`alert alert--${notice.kind}`}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </div>
      )}

      <div className="form__actions">
        <button
          type="button"
          className="button button--primary"
          disabled={pending || own === null}
          onClick={() => {
            setNotice(null);
            setRequesting(true);
          }}
        >
          Solicitar más usuarios
        </button>
        {pending ? (
          <small className="muted">Tiene una solicitud pendiente de respuesta.</small>
        ) : null}
      </div>

      {own === null || own.requests.length === 0 ? null : (
        <div className="table-wrapper">
          <table className="table">
            <caption className="muted">Mis solicitudes</caption>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuarios</th>
                <th>Monto mensual</th>
                <th>Estado</th>
                <th>Respuesta</th>
              </tr>
            </thead>
            <tbody>
              {own.requests.map((request) => (
                <tr key={request.id}>
                  <td>{new Date(request.createdAt).toLocaleDateString('es-CR')}</td>
                  <td>+{request.extraUsers}</td>
                  <td>{formatMoney(request.monthlyAmount)}</td>
                  <td>
                    <RequestStatusBadge status={request.status} />
                  </td>
                  <td>{request.response ?? <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {requesting && own !== null ? (
        <PlanRequestDialog
          pricePerExtraUser={own.pricePerExtraUser}
          onClose={() => setRequesting(false)}
          onSent={() => {
            setRequesting(false);
            setNotice({
              kind: 'success',
              text: 'Solicitud enviada. Cuando la plataforma la apruebe podrá crear los usuarios.',
            });
            void Promise.all([loadOwn(), reload()]);
          }}
        />
      ) : null}
    </section>
  );
}

/** Pide N usuarios más con la cotización mensual (N × precio por usuario). */
function PlanRequestDialog({
  pricePerExtraUser,
  onClose,
  onSent,
}: {
  pricePerExtraUser: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [count, setCount] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Number(count);
  const valid = Number.isInteger(value) && value >= 1 && value <= 50;
  const quote = valid ? (Number(pricePerExtraUser) * value).toFixed(2) : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!valid) {
      setError('Escriba un número entero de 1 a 50.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await planRequestsService.create(value, note.trim() === '' ? null : note.trim());
      onSent();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo enviar la solicitud.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Solicitar más usuarios" onClose={onClose}>
      {error === null ? null : (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}
      <form className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="form__grid">
          <div className="form__field">
            <label htmlFor="plan-request-count">Usuarios adicionales</label>
            <input
              id="plan-request-count"
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(event) => setCount(event.target.value)}
            />
          </div>
          <div className="form__field">
            <span>Monto mensual adicional</span>
            <strong aria-live="polite">{quote === null ? '—' : formatMoney(quote)}</strong>
            <small className="muted">{formatMoney(pricePerExtraUser)} por usuario al mes.</small>
          </div>
          <div className="form__field form__field--wide">
            <label htmlFor="plan-request-note">Nota (opcional)</label>
            <textarea
              id="plan-request-note"
              rows={2}
              maxLength={300}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>
        <p className="muted">
          La solicitud llega a la plataforma. Al aprobarla, el límite de su plan sube y usted crea
          los usuarios en la pestaña Usuarios.
        </p>
        <div className="form__actions">
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar solicitud'}
          </button>
          <button type="button" className="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
