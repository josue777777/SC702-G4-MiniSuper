import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  fieldErrorsFromDetails,
  validateEmail,
  validateLoginPassword,
} from '../features/auth/account-rules';
import { ApiError } from '../services/api-client';
import { authService } from '../services/auth.service';
import { businessService } from '../services/business.service';
import type { PublicBusiness } from '../types/business';

interface LoginLocationState {
  notice?: string;
}

interface LoginFieldErrors {
  email?: string;
  password?: string;
}

/**
 * Acceso al sistema (HU-11).
 *
 * Valida que vengan ambos campos y su formato antes de llamar al servidor, que
 * repite las mismas reglas. Un fallo de credenciales muestra siempre el mismo
 * mensaje, sin decir si falló el correo o la contraseña. Al cerrar sesión
 * (HU-15) se vuelve aquí con un aviso. No hay registro público: los usuarios
 * los crea el administrador, que también restablece contraseñas (HU-13).
 */
export function LoginPage() {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: LoginLocationState | null };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Nombre y logo del negocio (Configuración › General); sin ellos, solo «Sistema de gestión». */
  const [business, setBusiness] = useState<PublicBusiness | null>(null);

  useEffect(() => {
    businessService
      .getPublic()
      .then(setBusiness)
      .catch(() => setBusiness(null));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const emailError = validateEmail(email);
    const passwordError = validateLoginPassword(password);
    const nextErrors: LoginFieldErrors = {
      ...(emailError === undefined ? {} : { email: emailError }),
      ...(passwordError === undefined ? {} : { password: passwordError }),
    };

    setFieldErrors(nextErrors);
    setError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setBusy(true);

    try {
      const user = await authService.login({ email: email.trim(), password });
      // Con contraseña temporal, lo primero es cambiarla.
      navigate(user.mustChangePassword ? '/profile' : '/', { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 400) {
        const fromServer = fieldErrorsFromDetails(caught.details);

        if (fromServer['email'] !== undefined || fromServer['password'] !== undefined) {
          setFieldErrors({
            ...(fromServer['email'] === undefined ? {} : { email: fromServer['email'] }),
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
        {business?.logoUrl == null ? null : (
          <img
            className="business-logo login__logo"
            src={businessService.logoSrc(business.logoUrl)}
            alt={`Logo de ${business.name}`}
          />
        )}
        <h1>Iniciar sesión</h1>
        <p className="muted">
          {business === null ? 'Sistema de gestión' : `${business.name} · sistema de gestión`}
        </p>

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
          <label htmlFor="login-email">Correo electrónico</label>
          <input
            id="login-email"
            type="email"
            value={email}
            autoComplete="username"
            aria-invalid={fieldErrors.email !== undefined}
            {...(fieldErrors.email === undefined
              ? {}
              : { 'aria-describedby': 'login-email-error' })}
            onChange={(event) => setEmail(event.target.value)}
          />
          {fieldErrors.email === undefined ? null : (
            <p id="login-email-error" className="form__error">
              {fieldErrors.email}
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

        <p className="muted hint">
          ¿Olvidó su contraseña? Pídale al administrador que se la restablezca.
        </p>
      </form>
    </div>
  );
}
