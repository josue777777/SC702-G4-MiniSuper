import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../components/Modal';
import { validateEmail, validateName } from '../features/auth/account-rules';
import { TemporaryPasswordDialog } from '../features/users/TemporaryPasswordDialog';
import { ApiError } from '../services/api-client';
import { platformService } from '../services/platform.service';
import type { BusinessSummary, BusinessWithManager } from '../types/platform';

function describeError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Ocurrió un error inesperado. Intente de nuevo.';
}

/** «Encargado + N»: el plan 0 es solo el Encargado; cada nivel suma un usuario. */
function planLabel(extraUsers: number): string {
  return extraUsers === 0 ? 'Solo Encargado' : `Encargado + ${extraUsers}`;
}

type Dialog =
  | { kind: 'create' }
  | { kind: 'plan'; business: BusinessSummary }
  | { kind: 'status'; business: BusinessSummary };

/**
 * Negocios clientes de la plataforma (solo Administrador). Se ve lo necesario
 * para administrarlos: plan, usuarios en uso, estado y su Encargado. NUNCA sus
 * datos internos (ventas, productos, clientes): eso es de cada negocio.
 */
export function BusinessesPage() {
  const [businesses, setBusinesses] = useState<BusinessSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [created, setCreated] = useState<BusinessWithManager | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setBusinesses(await platformService.listBusinesses());
      setLoadError(null);
    } catch (error) {
      setLoadError(describeError(error));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function done(text: string): void {
    setDialog(null);
    setNotice(text);
    void load();
  }

  return (
    <>
      <header className="page-header">
        <h1>Negocios</h1>
        <p>
          Los clientes de la plataforma: su plan, cuántos usuarios usan y su Encargado. Los datos
          internos de cada negocio solo los ve su gente.
        </p>
      </header>

      <div className="toolbar">
        <button
          type="button"
          className="button button--primary"
          disabled={businesses === null}
          onClick={() => {
            setNotice(null);
            setDialog({ kind: 'create' });
          }}
        >
          + Nuevo negocio
        </button>
      </div>

      {notice === null ? null : (
        <p className="alert alert--success" role="status">
          {notice}
          <button
            type="button"
            className="alert__close"
            onClick={() => setNotice(null)}
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </p>
      )}

      {loadError === null ? null : (
        <section className="card">
          <header className="card__header">
            <h2>No se pudieron cargar los negocios</h2>
            <button type="button" className="button" onClick={() => void load()}>
              Reintentar
            </button>
          </header>
          <p className="muted">{loadError}</p>
        </section>
      )}

      {businesses === null && loadError === null ? (
        <p className="card muted">Cargando negocios…</p>
      ) : null}

      {businesses === null ? null : (
        <section className="card">
          <header className="card__header">
            <h2>Negocios clientes</h2>
            <span className="muted">{businesses.length} negocio(s)</span>
          </header>
          {businesses.length === 0 ? (
            <p className="muted">Todavía no hay negocios. Cree el primero con su Encargado.</p>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Negocio</th>
                    <th>Encargado</th>
                    <th>Plan</th>
                    <th>Usuarios activos</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {businesses.map((business) => (
                    <tr key={business.id}>
                      <td>
                        <strong>{business.name}</strong>
                        {business.pendingRequest ? (
                          <div>
                            <Link to="/platform/requests" className="badge badge--warning">
                              Solicitud pendiente
                            </Link>
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {business.manager === null ? (
                          <span className="muted">Sin Encargado activo</span>
                        ) : (
                          <>
                            {business.manager.name}
                            <div className="muted">{business.manager.email}</div>
                          </>
                        )}
                      </td>
                      <td>{planLabel(business.extraUsers)}</td>
                      <td>
                        {business.usedSeats} de {business.maxUsers}
                      </td>
                      <td>
                        {business.status === 'ACTIVE' ? (
                          <span className="badge badge--ok">Activo</span>
                        ) : (
                          <span className="badge badge--muted">Suspendido</span>
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="button"
                            onClick={() => setDialog({ kind: 'plan', business })}
                          >
                            Cambiar plan
                          </button>
                          <button
                            type="button"
                            className={
                              business.status === 'ACTIVE' ? 'button button--danger' : 'button'
                            }
                            onClick={() => setDialog({ kind: 'status', business })}
                          >
                            {business.status === 'ACTIVE' ? 'Suspender' : 'Reactivar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {dialog?.kind === 'create' ? (
        <CreateBusinessDialog
          onClose={() => setDialog(null)}
          onCreated={(result) => {
            setCreated(result);
            done(`Negocio «${result.business.name}» creado con su Encargado.`);
          }}
        />
      ) : null}

      {dialog?.kind === 'plan' ? (
        <PlanDialog
          business={dialog.business}
          onClose={() => setDialog(null)}
          onSaved={(saved) => done(`Plan de «${saved.name}»: ${planLabel(saved.extraUsers)}.`)}
        />
      ) : null}

      {dialog?.kind === 'status' ? (
        <StatusDialog
          business={dialog.business}
          onClose={() => setDialog(null)}
          onSaved={(saved) =>
            done(
              saved.status === 'ACTIVE'
                ? `«${saved.name}» reactivado: su gente ya puede entrar.`
                : `«${saved.name}» suspendido: su gente no puede entrar. Sus datos se conservan.`,
            )
          }
        />
      ) : null}

      {created === null ? null : (
        <TemporaryPasswordDialog
          reveal={{
            user: created.manager,
            temporaryPassword: created.manager.temporaryPassword,
            reason: 'created',
          }}
          onClose={() => setCreated(null)}
        />
      )}
    </>
  );
}

/** Alta de un negocio con su Encargado y su plan. */
function CreateBusinessDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (result: BusinessWithManager) => void;
}) {
  const [values, setValues] = useState({
    businessName: '',
    extraUsers: '0',
    managerName: '',
    managerEmail: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof values, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const extraUsers = Number(values.extraUsers);
    const found: typeof errors = {};

    if (values.businessName.trim() === '') found.businessName = 'Escriba el nombre del negocio.';
    if (!Number.isInteger(extraUsers) || extraUsers < 0 || extraUsers > 500) {
      found.extraUsers = 'Escriba un número entero de 0 a 500.';
    }
    const nameError = validateName(values.managerName);
    const emailError = validateEmail(values.managerEmail);
    if (nameError !== undefined) found.managerName = nameError;
    if (emailError !== undefined) found.managerEmail = emailError;

    setErrors(found);

    if (Object.keys(found).length > 0) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      onCreated(
        await platformService.createBusiness({
          businessName: values.businessName.trim(),
          extraUsers,
          managerName: values.managerName.trim(),
          managerEmail: values.managerEmail.trim().toLowerCase(),
        }),
      );
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  function field(name: keyof typeof values, label: string, type = 'text') {
    return (
      <div className="form__field">
        <label htmlFor={`new-business-${name}`}>{label}</label>
        <input
          id={`new-business-${name}`}
          type={type}
          value={values[name]}
          autoComplete="off"
          onChange={(event) => setValues({ ...values, [name]: event.target.value })}
        />
        {errors[name] === undefined ? null : <p className="form__error">{errors[name]}</p>}
      </div>
    );
  }

  return (
    <Modal title="Nuevo negocio" onClose={onClose}>
      {error === null ? null : (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}
      <form className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <h3 className="form__section-title">Negocio</h3>
        <div className="form__grid">
          {field('businessName', 'Nombre del negocio')}
          {field('extraUsers', 'Usuarios adicionales al Encargado', 'number')}
        </div>
        <p className="muted">
          Plan 0 = solo el Encargado. Cada usuario adicional le permite crear un Cajero o Bodega.
        </p>
        <h3 className="form__section-title">Encargado (dueño del negocio)</h3>
        <div className="form__grid">
          {field('managerName', 'Nombre')}
          {field('managerEmail', 'Correo electrónico', 'email')}
        </div>
        <p className="muted">
          Al guardar se genera una contraseña temporal para el Encargado: se muestra una sola vez.
        </p>
        <div className="form__actions">
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Creando…' : 'Crear negocio'}
          </button>
          <button type="button" className="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Cambia cuántos usuarios adicionales tiene el plan del negocio. */
function PlanDialog({
  business,
  onClose,
  onSaved,
}: {
  business: BusinessSummary;
  onClose: () => void;
  onSaved: (saved: BusinessSummary) => void;
}) {
  const [extra, setExtra] = useState(String(business.extraUsers));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Number(extra);
  const valid = Number.isInteger(value) && value >= 0 && value <= 500;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!valid) {
      setError('Escriba un número entero de 0 a 500.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      onSaved(await platformService.setPlan(business.id, value));
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Plan de ${business.name}`} onClose={onClose}>
      {error === null ? null : (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}
      <form className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="form__field">
          <label htmlFor="plan-extra-users">Usuarios adicionales al Encargado</label>
          <input
            id="plan-extra-users"
            type="number"
            min={0}
            max={500}
            value={extra}
            onChange={(event) => setExtra(event.target.value)}
          />
          <small className="muted">
            Límite: {valid ? 1 + value : '—'} usuario(s) activos. Hoy usa {business.usedSeats}. Si
            queda por debajo, nadie se desactiva: solo no podrá crear ni activar usuarios.
          </small>
        </div>
        <div className="form__actions">
          <button
            type="submit"
            className="button button--primary"
            disabled={busy || value === business.extraUsers}
          >
            {busy ? 'Guardando…' : 'Guardar plan'}
          </button>
          <button type="button" className="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Confirma suspender o reactivar un negocio. */
function StatusDialog({
  business,
  onClose,
  onSaved,
}: {
  business: BusinessSummary;
  onClose: () => void;
  onSaved: (saved: BusinessSummary) => void;
}) {
  const suspending = business.status === 'ACTIVE';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(): Promise<void> {
    setBusy(true);
    setError(null);

    try {
      onSaved(await platformService.setSuspended(business.id, suspending));
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={suspending ? 'Suspender negocio' : 'Reactivar negocio'} onClose={onClose}>
      {error === null ? null : (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}
      <p>
        {suspending
          ? `Nadie de «${business.name}» podrá iniciar sesión y sus sesiones abiertas dejan de valer. Sus datos no se borran: al reactivarlo todo sigue igual.`
          : `La gente de «${business.name}» podrá volver a iniciar sesión.`}
      </p>
      <div className="form__actions">
        <button
          type="button"
          className={suspending ? 'button button--danger' : 'button button--primary'}
          disabled={busy}
          onClick={() => void confirm()}
        >
          {suspending ? 'Suspender' : 'Reactivar'}
        </button>
        <button type="button" className="button" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}
