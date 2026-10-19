import { useState, type FormEvent } from 'react';
import {
  fieldErrorsFromDetails,
  PASSWORD_MIN_LENGTH,
  validateEmail,
  validateName,
  validateNewPassword,
} from '../auth/account-rules';
import type { Profile, ProfileUpdatePayload } from '../../types/auth';
import type { SaveFailure } from './use-profile';

interface ProfileFormProps {
  profile: Profile;
  save: (payload: ProfileUpdatePayload) => Promise<SaveFailure | null>;
}

type FieldName = 'name' | 'email' | 'currentPassword' | 'newPassword' | 'confirm';
type FieldErrors = Partial<Record<FieldName, string>>;

/**
 * Formulario de edición de perfil (HU-14).
 *
 * Arranca con los valores guardados. La contraseña actual NUNCA se precarga: se
 * pide solo para cambiar el correo o la contraseña. "Cancelar" restaura lo
 * guardado sin enviar nada al servidor.
 */
export function ProfileForm({ profile, save }: ProfileFormProps) {
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nameChanged = name.trim() !== profile.name;
  const emailChanged = email.trim().toLowerCase() !== profile.email;
  const passwordChanged = newPassword !== '';
  const dirty = nameChanged || emailChanged || passwordChanged;
  const needsCurrentPassword = emailChanged || passwordChanged;

  function resetToSaved(): void {
    setName(profile.name);
    setEmail(profile.email);
    setCurrentPassword('');
    setNewPassword('');
    setConfirm('');
    setErrors({});
    setFailure(null);
  }

  function validate(): FieldErrors {
    const found: FieldErrors = {};
    const nameError = validateName(name);
    const emailError = validateEmail(email);

    if (nameError !== undefined) found.name = nameError;
    if (emailError !== undefined) found.email = emailError;

    if (passwordChanged) {
      const passwordError = validateNewPassword(newPassword);

      if (passwordError !== undefined) found.newPassword = passwordError;
      if (confirm !== newPassword) found.confirm = 'Las contraseñas no coinciden.';
    }

    if (needsCurrentPassword && currentPassword === '') {
      found.currentPassword = 'Escriba su contraseña actual para confirmar el cambio.';
    }

    return found;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFailure(null);
    setSuccess(null);

    const found = validate();
    setErrors(found);

    if (Object.keys(found).length > 0) {
      return;
    }

    const payload: ProfileUpdatePayload = {
      ...(nameChanged ? { name: name.trim() } : {}),
      ...(emailChanged ? { email: email.trim() } : {}),
      ...(passwordChanged ? { newPassword } : {}),
      ...(needsCurrentPassword ? { currentPassword } : {}),
    };

    setBusy(true);
    const result = await save(payload);
    setBusy(false);

    if (result === null) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      setSuccess('Perfil actualizado correctamente.');
      return;
    }

    setErrors(fieldErrorsFromDetails(result.details));
    setFailure(result.message);
  }

  return (
    <section className="card profile-card">
      <header className="card__header">
        <h2>Datos de la cuenta</h2>
      </header>

      {success === null ? null : (
        <div className="alert alert--success" role="status">
          {success}
        </div>
      )}
      {failure === null ? null : (
        <div className="alert alert--error" role="alert">
          {failure}
        </div>
      )}

      <form className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="form__grid">
          <div className="form__field">
            <label htmlFor="profile-name">Nombre</label>
            <input
              id="profile-name"
              value={name}
              maxLength={80}
              autoComplete="name"
              onChange={(event) => setName(event.target.value)}
            />
            {errors.name === undefined ? null : <p className="form__error">{errors.name}</p>}
          </div>

          <div className="form__field">
            <label htmlFor="profile-email">Correo electrónico</label>
            <input
              id="profile-email"
              type="email"
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
            />
            <small className="muted">Se usará para recuperar la contraseña.</small>
            {errors.email === undefined ? null : <p className="form__error">{errors.email}</p>}
          </div>
        </div>

        <h3 className="form__section-title">Cambiar contraseña (opcional)</h3>
        <div className="form__grid">
          <div className="form__field">
            <label htmlFor="profile-new-password">Nueva contraseña</label>
            <input
              id="profile-new-password"
              type="password"
              value={newPassword}
              autoComplete="new-password"
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <small className="muted">
              Mínimo {PASSWORD_MIN_LENGTH} caracteres, con una letra y un número.
            </small>
            {errors.newPassword === undefined ? null : (
              <p className="form__error">{errors.newPassword}</p>
            )}
          </div>

          <div className="form__field">
            <label htmlFor="profile-confirm">Confirmar nueva contraseña</label>
            <input
              id="profile-confirm"
              type="password"
              value={confirm}
              autoComplete="new-password"
              onChange={(event) => setConfirm(event.target.value)}
            />
            {errors.confirm === undefined ? null : <p className="form__error">{errors.confirm}</p>}
          </div>

          <div className="form__field">
            <label htmlFor="profile-current-password">Contraseña actual</label>
            <input
              id="profile-current-password"
              type="password"
              value={currentPassword}
              autoComplete="current-password"
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
            <small className="muted">Solo se pide para cambiar el correo o la contraseña.</small>
            {errors.currentPassword === undefined ? null : (
              <p className="form__error">{errors.currentPassword}</p>
            )}
          </div>
        </div>

        <div className="form__actions">
          <button type="submit" className="button button--primary" disabled={busy || !dirty}>
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <button
            type="button"
            className="button"
            disabled={busy || (!dirty && currentPassword === '')}
            onClick={resetToSaved}
          >
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}
