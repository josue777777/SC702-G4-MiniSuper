import type { Role, UserListItem } from '../../types/auth';
import { canManageRole, ROLE_LABELS } from './roles';

interface UserTableProps {
  users: UserListItem[];
  /** Id de quien usa el sistema: no puede desactivarse ni restablecerse a sí mismo. */
  currentUserId: string;
  /** Rol de quien usa el sistema: solo ve acciones sobre rangos menores al suyo. */
  currentRole: Role;
  busy: boolean;
  onEdit: (user: UserListItem) => void;
  onResetPassword: (user: UserListItem) => void;
  onSetActive: (user: UserListItem, active: boolean) => void;
}

function StatusBadge({ user }: { user: UserListItem }) {
  if (!user.isActive) {
    return <span className="badge badge--muted">Inactivo</span>;
  }

  return user.mustChangePassword ? (
    <span className="badge badge--warning" title="Todavía no ha cambiado su contraseña temporal">
      Contraseña temporal
    </span>
  ) : (
    <span className="badge badge--ok">Activo</span>
  );
}

/** Usuarios con su rol y estado. Los inactivos no se borran: quedan al final. */
export function UserTable({
  users,
  currentUserId,
  currentRole,
  busy,
  onEdit,
  onResetPassword,
  onSetActive,
}: UserTableProps) {
  return (
    <section className="card">
      <header className="card__header">
        <h2>Usuarios</h2>
        <span className="muted">{users.length} usuario(s)</span>
      </header>

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              const manageable = !isSelf && canManageRole(currentRole, user.role);

              return (
                <tr key={user.id}>
                  <td>
                    <strong>{user.name}</strong>
                    {isSelf ? <span className="badge badge--muted">usted</span> : null}
                    <div className="muted">{user.email}</div>
                  </td>
                  <td>{ROLE_LABELS[user.role]}</td>
                  <td>
                    <StatusBadge user={user} />
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="button"
                        disabled={busy}
                        onClick={() => onEdit(user)}
                      >
                        Editar
                      </button>
                      {manageable ? (
                        <>
                          <button
                            type="button"
                            className="button"
                            disabled={busy || !user.isActive}
                            onClick={() => onResetPassword(user)}
                          >
                            Restablecer contraseña
                          </button>
                          <button
                            type="button"
                            className="button"
                            disabled={busy}
                            onClick={() => onSetActive(user, !user.isActive)}
                          >
                            {user.isActive ? 'Desactivar' : 'Activar'}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
