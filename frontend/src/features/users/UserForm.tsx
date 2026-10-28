import { useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import type { CreateUserPayload, Role, UserListItem } from '../../types/auth';
import { validateEmail, validateName } from '../auth/account-rules';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from './roles';

interface UserFormProps {
  /** Usuario en edición; `null` para crear uno nuevo. */
  user: UserListItem | null;
  /** `true` si es la cuenta de quien está usando el sistema: no puede cambiarse el rol. */
  isSelf: boolean;
  /** Roles que quien usa el sistema puede asignar (jerarquía: solo rangos menores). */
  roleOptions: Role[];
  busy: boolean;
  serverError: string | null;
  onCancel: () => void;
  /** En edición solo viajan los campos que cambiaron. */
  onSubmit: (payload: Partial<CreateUserPayload>) => void;
}

type FieldErrors = Partial<Record<'name' | 'email', string>>;

/**
 * Formulario de usuario: nombre, correo y rol. La contraseña no se escribe
 * aquí: al crear, el sistema genera una temporal y la muestra una vez.
 */
export function UserForm({
  user,
  isSelf,
  roleOptions,
  busy,
  serverError,
  onCancel,
  onSubmit,
}: UserFormProps) {
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? roleOptions.at(-1) ?? 'CAJERO');
  // Al editarse a sí mismo, su rol se muestra aunque no lo pueda asignar.
  const options =
    user !== null && !roleOptions.includes(user.role) ? [user.role, ...roleOptions] : roleOptions;
  const [errors, setErrors] = useState<FieldErrors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const nameError = validateName(name);
    const emailError = validateEmail(email);
    const found: FieldErrors = {
      ...(nameError === undefined ? {} : { name: nameError }),
      ...(emailError === undefined ? {} : { email: emailError }),
    };

    setErrors(found);

    if (Object.keys(found).length > 0) {
      return;
    }

    const values = { name: name.trim(), email: email.trim().toLowerCase(), role };

    if (user === null) {
      onSubmit(values);
      return;
    }

    onSubmit({
      ...(values.name === user.name ? {} : { name: values.name }),
      ...(values.email === user.email ? {} : { email: values.email }),
      ...(values.role === user.role ? {} : { role: values.role }),
    });
  }

  return (
    <Modal title={user === null ? 'Nuevo usuario' : `Editar a ${user.name}`} onClose={onCancel}>
      {serverError === null ? null : (
        <div className="alert alert--error" role="alert">
          {serverError}
        </div>
      )}

      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="form__grid">
          <div className="form__field">
            <label htmlFor="user-name">Nombre</label>
            <input
              id="user-name"
              value={name}
              maxLength={80}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
            {errors.name === undefined ? null : <p className="form__error">{errors.name}</p>}
          </div>

          <div className="form__field">
            <label htmlFor="user-email">Correo electrónico</label>
            <input
              id="user-email"
              type="email"
              value={email}
              autoComplete="off"
              onChange={(event) => setEmail(event.target.value)}
            />
            <small className="muted">Con este correo inicia sesión.</small>
            {errors.email === undefined ? null : <p className="form__error">{errors.email}</p>}
          </div>

          <div className="form__field">
            <label htmlFor="user-role">Rol</label>
            <select
              id="user-role"
              value={role}
              disabled={isSelf}
              onChange={(event) => setRole(event.target.value as Role)}
            >
              {options.map((option) => (
                <option key={option} value={option}>
                  {ROLE_LABELS[option]}
                </option>
              ))}
            </select>
            <small className="muted">
              {isSelf ? 'No puede cambiar su propio rol.' : ROLE_DESCRIPTIONS[role]}
            </small>
          </div>
        </div>

        {user === null ? (
          <p className="muted">
            Al guardar, el sistema genera una contraseña temporal. Entréguesela a la persona: la
            tendrá que cambiar en su primer ingreso.
          </p>
        ) : null}

        <div className="form__actions">
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Guardando…' : user === null ? 'Crear usuario' : 'Guardar cambios'}
          </button>
          <button type="button" className="button" disabled={busy} onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
