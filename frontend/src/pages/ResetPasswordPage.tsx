import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { validateNewPassword } from '../features/auth/account-rules';
import { usePlatform } from '../features/platform/platform-context';
import { ApiError } from '../services/api-client';
import { authService } from '../services/auth.service';

interface FieldErrors {
  password?: string;
  confirm?: string;
}

/**
 * Contraseña nueva con el enlace del correo (HU-13).
 *
 * El token viene en la dirección (`?token=…`). El servidor comprueba que no
 * venció ni se usó; al cambiarla cierra todas las sesiones de la cuenta, así
 * que se vuelve al login para entrar con la contraseña nueva.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { systemName } = usePlatform();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const passwordError = validateNewPassword(password);
    const nextErrors: FieldErrors = {
      ...(passwordError === undefined ? {} : { password: passwordError }),
      ...(confirm === password ? {} : { confirm: 'Las contraseñas no coinciden.' }),
    };

    setFieldErrors(nextErrors);
    setError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setBusy(true);

    try {
      await authService.resetPassword(token, password);
      navigate('/login', {
        replace: true,
        state: { notice: 'Contraseña actualizada. Ya puede iniciar sesión con la nueva.' },
      });
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
        <h1>Contraseña nueva</h1>
        <p className="muted">{systemName} · sistema de gestión</p>

        {token === '' ? (
          <div className="alert alert--error" role="alert">
            El enlace no es válido. Ábralo de nuevo desde su correo o solicite uno nuevo.
          </div>
        ) : (
          <>
            {error === null ? null : (
              <div className="alert alert--error" role="alert">
                {error}
              </div>
            )}

            <div className="field">
              <label htmlFor="reset-password">Contraseña nueva</label>
              <input
                id="reset-password"
                type="password"
                value={password}
                autoComplete="new-password"
                aria-invalid={fieldErrors.password !== undefined}
                {...(fieldErrors.password === undefined
                  ? {}
                  : { 'aria-describedby': 'reset-password-error' })}
                onChange={(event) => setPassword(event.target.value)}
              />
              {fieldErrors.password === undefined ? (
                <small className="muted">Mínimo 10 caracteres, con letras y números.</small>
              ) : (
                <p id="reset-password-error" className="form__error">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <div className="field">
              <label htmlFor="reset-confirm">Repita la contraseña nueva</label>
              <input
                id="reset-confirm"
                type="password"
                value={confirm}
                autoComplete="new-password"
                aria-invalid={fieldErrors.confirm !== undefined}
                {...(fieldErrors.confirm === undefined
                  ? {}
                  : { 'aria-describedby': 'reset-confirm-error' })}
                onChange={(event) => setConfirm(event.target.value)}
              />
              {fieldErrors.confirm === undefined ? null : (
                <p id="reset-confirm-error" className="form__error">
                  {fieldErrors.confirm}
                </p>
              )}
            </div>

            <button type="submit" className="button button--block" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </>
        )}

        <p className="hint login__links">
          <Link to="/forgot-password">Solicitar otro enlace</Link> ·{' '}
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </form>
    </div>
  );
}
