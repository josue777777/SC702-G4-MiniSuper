import { useState, type FormEvent } from 'react';
import { ApiError } from '../../services/api-client';
import { authService } from '../../services/auth.service';
import {
  fieldErrorsFromDetails,
  PASSWORD_MIN_LENGTH,
  validateEmail,
  validateName,
  validateNewPassword,
} from './account-rules';

interface SetupFormProps {
  /** El backend exige el token de instalación definido por el administrador. */
  tokenRequired: boolean;
  /** Se llama con la cuenta ya creada. */
  onDone: () => void;
}

type FieldName = 'name' | 'email' | 'password' | 'confirm' | 'setupToken';
type FieldErrors = Partial<Record<FieldName, string>>;

/** Formulario de configuración inicial de la cuenta única del dueño (HU-12). */
export function SetupForm({ tokenRequired, onDone }: SetupFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function validate(): FieldErrors {
    const found: FieldErrors = {};
    const nameError = validateName(name);
    const emailError = validateEmail(email);
    const passwordError = validateNewPassword(password);

    if (nameError !== undefined) found.name = nameError;
    if (emailError !== undefined) found.email = emailError;
    if (passwordError !== undefined) found.password = passwordError;
    if (confirm !== password) found.confirm = 'Las contraseñas no coinciden.';
    if (tokenRequired && setupToken.trim() === '') {
      found.setupToken = 'Escriba el token de configuración que le dio el administrador.';
    }

    return found;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFailure(null);

    const found = validate();
    setErrors(found);

    if (Object.keys(found).length > 0) {
      return;
    }

    setBusy(true);

    try {
      await authService.setup({
        name: name.trim(),
        email: email.trim(),
        password,
        ...(tokenRequired ? { setupToken: setupToken.trim() } : {}),
      });
      onDone();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(fieldErrorsFromDetails(caught.details));
        setFailure(caught.message);
      } else {
        setFailure('Ocurrió un error inesperado. Intente de nuevo.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="login__card" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <h1>Configurar cuenta del dueño</h1>
      <p className="muted">
        Primera vez en el sistema: cree la cuenta única con la que va a trabajar. Esto se hace una
        sola vez.
      </p>

      {failure === null ? null : (
        <div className="alert alert--error" role="alert">
          {failure}
        </div>
      )}

      <div className="field">
        <label htmlFor="setup-name">Nombre</label>
        <input
          id="setup-name"
          value={name}
          maxLength={80}
          autoComplete="name"
          onChange={(event) => setName(event.target.value)}
        />
        {errors.name === undefined ? null : <p className="form__error">{errors.name}</p>}
      </div>

      <div className="field">
        <label htmlFor="setup-email">Correo electrónico</label>
        <input
          id="setup-email"
          type="email"
          value={email}
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
        />
        {errors.email === undefined ? null : <p className="form__error">{errors.email}</p>}
      </div>

      <div className="field">
        <label htmlFor="setup-password">Contraseña</label>
        <input
          id="setup-password"
          type="password"
          value={password}
          autoComplete="new-password"
          onChange={(event) => setPassword(event.target.value)}
        />
        <small className="muted">
          Mínimo {PASSWORD_MIN_LENGTH} caracteres, con al menos una letra y un número.
        </small>
        {errors.password === undefined ? null : <p className="form__error">{errors.password}</p>}
      </div>

      <div className="field">
        <label htmlFor="setup-confirm">Confirmar contraseña</label>
        <input
          id="setup-confirm"
          type="password"
          value={confirm}
          autoComplete="new-password"
          onChange={(event) => setConfirm(event.target.value)}
        />
        {errors.confirm === undefined ? null : <p className="form__error">{errors.confirm}</p>}
      </div>

      {tokenRequired ? (
        <div className="field">
          <label htmlFor="setup-token">Token de configuración</label>
          <input
            id="setup-token"
            type="password"
            value={setupToken}
            autoComplete="off"
            onChange={(event) => setSetupToken(event.target.value)}
          />
          <small className="muted">Lo define quien instaló el sistema en el servidor.</small>
          {errors.setupToken === undefined ? null : (
            <p className="form__error">{errors.setupToken}</p>
          )}
        </div>
      ) : null}

      <button type="submit" className="button button--block" disabled={busy}>
        {busy ? 'Creando cuenta…' : 'Crear cuenta'}
      </button>
    </form>
  );
}
