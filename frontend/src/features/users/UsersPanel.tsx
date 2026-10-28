import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { useSession } from '../auth/session-context';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES } from './roles';
import { TemporaryPasswordDialog } from './TemporaryPasswordDialog';
import { UserForm } from './UserForm';
import { UserTable } from './UserTable';
import { useUsers } from './use-users';
import type { CreateUserPayload, UserListItem } from '../../types/auth';

/** Acción que se confirma antes de enviarla, porque cierra las sesiones del usuario. */
type PendingAction = { kind: 'reset' | 'deactivate'; user: UserListItem };

/**
 * Pestaña Usuarios de la ventana de Configuración (solo Administrador;
 * criterios de usuarios y roles de HU-11 a HU-15). Crear usuarios con su rol,
 * editarlos, desactivarlos (no se borran) y restablecer su contraseña con una
 * temporal.
 */
export function UsersPanel() {
  const { user: currentUser } = useSession();
  const {
    phase,
    users,
    message,
    notice,
    busy,
    reveal,
    reload,
    createUser,
    updateUser,
    setActive,
    resetPassword,
    dismissNotice,
    dismissReveal,
  } = useUsers();

  /** Usuario en edición; `null` con el formulario abierto significa alta. */
  const [editing, setEditing] = useState<UserListItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);

  function closeForm(): void {
    setFormOpen(false);
    setEditing(null);
    dismissNotice();
  }

  async function handleSubmit(payload: Partial<CreateUserPayload>): Promise<void> {
    if (editing !== null && Object.keys(payload).length === 0) {
      closeForm();
      return;
    }

    const saved =
      editing === null
        ? await createUser(payload as CreateUserPayload)
        : await updateUser(editing.id, payload);

    if (saved) {
      setFormOpen(false);
      setEditing(null);
    }
  }

  async function confirmPending(): Promise<void> {
    if (pending === null) {
      return;
    }

    const action = pending;

    setPending(null);
    await (action.kind === 'reset' ? resetPassword(action.user) : setActive(action.user, false));
  }

  return (
    <>
      <p className="muted">
        Quién puede entrar al sistema y qué puede hacer cada uno según su rol.
      </p>

      <div className="toolbar">
        <button
          type="button"
          className="button button--primary"
          disabled={busy || formOpen || phase !== 'ready'}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          + Nuevo usuario
        </button>
      </div>

      {notice === null || (formOpen && notice.kind === 'error') ? null : (
        <p className={`alert alert--${notice.kind}`} role="status">
          {notice.text}
          <button
            type="button"
            className="alert__close"
            onClick={dismissNotice}
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </p>
      )}

      {formOpen ? (
        <UserForm
          key={editing?.id ?? 'new'}
          user={editing}
          isSelf={editing?.id === currentUser.id}
          busy={busy}
          serverError={notice?.kind === 'error' ? notice.text : null}
          onCancel={closeForm}
          onSubmit={(payload) => void handleSubmit(payload)}
        />
      ) : null}

      {pending === null ? null : (
        <Modal
          title={pending.kind === 'reset' ? 'Restablecer contraseña' : 'Desactivar usuario'}
          onClose={() => setPending(null)}
        >
          <p>
            {pending.kind === 'reset'
              ? `Se generará una contraseña temporal nueva para ${pending.user.name}. La actual deja de servir y sus sesiones abiertas se cierran.`
              : `${pending.user.name} ya no podrá iniciar sesión y sus sesiones abiertas se cierran. No se borra: puede activarlo de nuevo cuando quiera.`}
          </p>
          <div className="form__actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => void confirmPending()}
            >
              {pending.kind === 'reset' ? 'Restablecer' : 'Desactivar'}
            </button>
            <button type="button" className="button" onClick={() => setPending(null)}>
              Cancelar
            </button>
          </div>
        </Modal>
      )}

      {reveal === null ? null : <TemporaryPasswordDialog reveal={reveal} onClose={dismissReveal} />}

      {phase === 'loading' ? <p className="card muted">Cargando usuarios…</p> : null}

      {phase === 'failed' ? (
        <section className="card">
          <header className="card__header">
            <h2>No se pudieron cargar los usuarios</h2>
            <button type="button" className="button" onClick={() => void reload()}>
              Reintentar
            </button>
          </header>
          <p className="muted">{message}</p>
        </section>
      ) : null}

      {phase === 'ready' ? (
        <UserTable
          users={users}
          currentUserId={currentUser.id}
          busy={busy || formOpen}
          onEdit={(user) => {
            setEditing(user);
            setFormOpen(true);
          }}
          onResetPassword={(user) => setPending({ kind: 'reset', user })}
          onSetActive={(user, active) =>
            active ? void setActive(user, true) : setPending({ kind: 'deactivate', user })
          }
        />
      ) : null}

      <section className="card">
        <header className="card__header">
          <h2>Roles</h2>
        </header>
        <ul className="role-list">
          {ROLES.map((role) => (
            <li key={role}>
              <strong>{ROLE_LABELS[role]}:</strong> {ROLE_DESCRIPTIONS[role]}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
