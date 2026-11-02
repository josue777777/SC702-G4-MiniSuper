import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  fieldErrorsFromDetails,
  validateLogin,
  validateLoginPassword,
} from '../features/auth/account-rules';
import { ApiError } from '../services/api-client';
import { usePlatform } from '../features/platform/platform-context';
import { authService } from '../services/auth.service';

interface LoginLocationState {
  notice?: string;
}

interface LoginFieldErrors {
  login?: string;
  password?: string;
}

/**
 * Acceso al sistema (HU-11).
 *
 * Un solo campo, «Correo o usuario» (HU-11): el Administrador y el Encargado
 * entran con su correo o su usuario; el personal, con su usuario (`jnavarro`).
 * El servidor decide por la `@`. Valida que vengan ambos campos antes de
 * llamar al servidor, que repite las reglas. Un fallo de credenciales muestra
 * siempre el mismo mensaje, sin decir qué falló. Al cerrar sesión
 * (HU-15) se vuelve aquí con un aviso. No hay registro público: los usuarios
 * los crea el administrador. «¿Olvidó su contraseña?» lleva a la recuperación
 * por correo (HU-13).
 */
export function LoginPage() {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: LoginLocationState | null };
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { systemName } = usePlatform();

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const loginError = validateLogin(login);
    const passwordError = validateLoginPassword(password);
    const nextErrors: LoginFieldErrors = {
      ...(loginError === undefined ? {} : { login: loginError }),
      ...(passwordError === undefined ? {} : { password: passwordError }),
    };

    setFieldErrors(nextErrors);
    setError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setBusy(true);

    try {
      const user = await authService.login({ login: login.trim(), password });
      // Con contraseña temporal, lo primero es cambiarla.
      navigate(user.mustChangePassword ? '/profile' : '/', { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 400) {
        const fromServer = fieldErrorsFromDetails(caught.details);

        if (fromServer['login'] !== undefined || fromServer['password'] !== undefined) {
          setFieldErrors({
            ...(fromServer['login'] === undefined ? {} : { login: fromServer['login'] }),
            ...(fromServer['password'] === undefined ? {} : { password: fromServer['password'] }),
          });
          return;
        }
      }

      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Ocurrió un error inesperado. Intente de nuevo.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login__card" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <h1>Iniciar sesión</h1>
        <p className="muted">{systemName} · sistema de gestión</p>

        {state?.notice === undefined ? null : (
          <div className="alert alert--success" role="status">
            {state.notice}
          </div>
        )}

        {error === null ? null : (
          <div className="alert alert--error" role="alert">
            {error}
          </div>
        )}

        <div className="field">
          <label htmlFor="login-identifier">Correo o usuario</label>
          <input
            id="login-identifier"
            type="text"
            value={login}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={fieldErrors.login !== undefined}
            {...(fieldErrors.login === undefined
              ? {}
              : { 'aria-describedby': 'login-identifier-error' })}
            onChange={(event) => setLogin(event.target.value)}
          />
          {fieldErrors.login === undefined ? null : (
            <p id="login-identifier-error" className="form__error">
              {fieldErrors.login}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="login-password">Contraseña</label>
          <input
            id="login-password"
            type="password"
            value={password}
            autoComplete="current-password"
            aria-invalid={fieldErrors.password !== undefined}
            {...(fieldErrors.password === undefined
              ? {}
              : { 'aria-describedby': 'login-password-error' })}
            onChange={(event) => setPassword(event.target.value)}
          />
          {fieldErrors.password === undefined ? null : (
            <p id="login-password-error" className="form__error">
              {fieldErrors.password}
            </p>
          )}
        </div>

        <button type="submit" className="button button--block" disabled={busy}>
          {busy ? 'Iniciando sesión…' : 'Iniciar sesión'}
        </button>

        <p className="hint login__links">
          <Link to="/forgot-password">¿Olvidó su contraseña?</Link>
        </p>
      </form>
    </div>
  );
}
