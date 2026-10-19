import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../services/api-client';
import { authService } from '../services/auth.service';

interface LoginLocationState {
  notice?: string;
}

/**
 * Acceso al sistema.
 *
 * Contiene solo el inicio de sesión mínimo que HU-14 necesita para saber quién
 * edita el perfil. Siguen pendientes de HU-11 la protección del resto de las
 * pantallas, de HU-13 la recuperación de contraseña y de HU-15 cerrar sesión.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: LoginLocationState | null };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (email.trim() === '' || password === '') {
      setError('Escriba su correo y su contraseña.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await authService.login({ email: email.trim(), password });
      navigate('/', { replace: true });
    } catch (caught) {
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
        <p className="muted">Abastecedor Nuevo Amanecer · sistema de gestión</p>

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
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="login-password">Contraseña</label>
          <input
            id="login-password"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <button type="submit" className="button button--block" disabled={busy}>
          {busy ? 'Ingresando…' : 'Ingresar'}
        </button>

        <p className="muted hint">
          Pendiente: HU-11 completa (proteger las pantallas), HU-13 (recuperar contraseña) y HU-15
          (cerrar sesión).
        </p>
      </form>
    </div>
  );
}
