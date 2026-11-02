import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import { usersService } from '../../services/users.service';
import type { CreateUserPayload, Role, UserListItem } from '../../types/auth';
import { validateEmail, validateName, validateUsername } from '../auth/account-rules';
import { recoversByEmail, ROLE_DESCRIPTIONS, ROLE_LABELS } from './roles';

interface UserFormProps {
  /** Usuario en edición; `null` para crear uno nuevo. */
  user: UserListItem | null;
  /** `true` si es la cuenta de quien está usando el sistema: no puede cambiarse el rol. */
  isSelf: boolean;
  /** Roles que quien usa el sistema puede asignar (jerarquía: solo rangos menores). */
  roleOptions: Role[];
  /**
   * Negocios para asignar a un Encargado nuevo (solo el Administrador de la
   * plataforma). Sin esta lista, el usuario queda en el negocio de quien lo crea.
   */
  businesses?: { id: string; name: string }[];
  busy: boolean;
  serverError: string | null;
  onCancel: () => void;
  /** En edición solo viajan los campos que cambiaron. */
  onSubmit: (payload: Partial<CreateUserPayload>) => void;
}

type FieldErrors = Partial<Record<'name' | 'username' | 'email' | 'businessId', string>>;

/** Espera tras la última tecla antes de pedir la sugerencia (no una petición por letra). */
const SUGGESTION_DELAY_MS = 350;

/**
 * Formulario de usuario: nombre, usuario, correo y rol (HU-12).
 *
 * - El **usuario** se sugiere solo al escribir el nombre («Juan Navarro» →
 *   `jnavarro`, o `jnavarro2` si ya existe). Se puede cambiar; si se cambia a
 *   mano, deja de sugerirse.
 * - El **correo** es obligatorio solo para los roles que recuperan su
 *   contraseña por correo; para el resto es opcional.
 * - La contraseña no se escribe aquí: al crear, el sistema genera una temporal
 *   y la muestra una vez, junto con el usuario.
 */
export function UserForm({
  user,
  isSelf,
  roleOptions,
  businesses,
  busy,
  serverError,
  onCancel,
  onSubmit,
}: UserFormProps) {
  const [name, setName] = useState(user?.name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  /** `true` cuando quien crea escribió el usuario a mano: ya no se reemplaza. */
  const [usernameEdited, setUsernameEdited] = useState(user !== null);
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? roleOptions.at(-1) ?? 'CAJERO');
  // Al editarse a sí mismo, su rol se muestra aunque no lo pueda asignar.
  const options =
    user !== null && !roleOptions.includes(user.role) ? [user.role, ...roleOptions] : roleOptions;
  const [businessId, setBusinessId] = useState('');
  /** Solo al crear un Encargado desde la plataforma se elige su negocio. */
  const choosesBusiness = user === null && businesses !== undefined && role === 'ENCARGADO';
  const [errors, setErrors] = useState<FieldErrors>({});
  const emailRequired = recoversByEmail(role);

  // --- Usuario sugerido mientras se escribe el nombre (solo al crear) --------
  useEffect(() => {
    if (usernameEdited || validateName(name) !== undefined) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      usersService
        .suggestUsername(name.trim())
        .then((suggested) => {
          if (!cancelled) {
            setUsername(suggested);
          }
        })
        .catch(() => {
          // Sin sugerencia el formulario sigue funcionando: el servidor genera uno al guardar.
        });
    }, SUGGESTION_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [name, usernameEdited]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const trimmedEmail = email.trim().toLowerCase();
    const nameError = validateName(name);
    const usernameError =
      username.trim() === '' && user === null ? undefined : validateUsername(username);
    const emailError =
      trimmedEmail === ''
        ? emailRequired
          ? 'Este rol necesita un correo: con él recupera su contraseña.'
          : undefined
        : validateEmail(trimmedEmail);
    const found: FieldErrors = {
      ...(nameError === undefined ? {} : { name: nameError }),
      ...(usernameError === undefined ? {} : { username: usernameError }),
      ...(emailError === undefined ? {} : { email: emailError }),
      ...(choosesBusiness && businessId === '' ? { businessId: 'Elija el negocio.' } : {}),
    };

    setErrors(found);

    if (Object.keys(found).length > 0) {
      return;
    }

    const values = {
      name: name.trim(),
      username: username.trim().toLowerCase(),
      email: trimmedEmail === '' ? null : trimmedEmail,
      role,
    };

    if (user === null) {
      const payload: Partial<CreateUserPayload> = {
        name: values.name,
        // Vacío: el servidor genera uno libre.
        ...(values.username === '' ? {} : { username: values.username }),
        email: values.email,
        role: values.role,
      };

      onSubmit(choosesBusiness ? { ...payload, businessId } : payload);
      return;
    }

    onSubmit({
      ...(values.name === user.name ? {} : { name: values.name }),
      ...(values.username === user.username ? {} : { username: values.username }),
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
            <label htmlFor="user-username">Usuario</label>
            <input
              id="user-username"
              value={username}
              maxLength={30}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => {
                setUsername(event.target.value);
                setUsernameEdited(true);
              }}
            />
            <small className="muted">
              {user === null && !usernameEdited
                ? 'Se sugiere a partir del nombre; puede cambiarlo.'
                : 'Con este usuario inicia sesión.'}
            </small>
            {errors.username === undefined ? null : (
              <p className="form__error">{errors.username}</p>
            )}
          </div>

          <div className="form__field">
            <label htmlFor="user-email">
              Correo electrónico {emailRequired ? null : <span className="muted">(opcional)</span>}
            </label>
            <input
              id="user-email"
              type="email"
              value={email}
              autoComplete="off"
              onChange={(event) => setEmail(event.target.value)}
            />
            <small className="muted">
              {emailRequired
                ? 'Con este correo también inicia sesión y recupera su contraseña.'
                : 'Si lo tiene, también puede iniciar sesión con él.'}
            </small>
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

          {choosesBusiness ? (
            <div className="form__field">
              <label htmlFor="user-business">Negocio</label>
              <select
                id="user-business"
                value={businessId}
                onChange={(event) => setBusinessId(event.target.value)}
              >
                <option value="">Elija el negocio…</option>
                {businesses.map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.name}
                  </option>
                ))}
              </select>
              <small className="muted">
                Ocupa un usuario del límite de ese negocio. Para un negocio nuevo, use Negocios ›
                Nuevo negocio.
              </small>
              {errors.businessId === undefined ? null : (
                <p className="form__error">{errors.businessId}</p>
              )}
            </div>
          ) : null}
        </div>

        {user === null ? (
          <p className="muted">
            Al guardar, el sistema genera una contraseña temporal. Entréguele a la persona su
            usuario y esa contraseña: la tendrá que cambiar en su primer ingreso.
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
