import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { validateEmail } from '../features/auth/account-rules';
import { usePlatform } from '../features/platform/platform-context';
import { ApiError } from '../services/api-client';
import { authService } from '../services/auth.service';

/**
 * «¿Olvidó su contraseña?» (HU-13).
 *
 * El Administrador y el Encargado reciben un enlace en su correo. El personal
 * (Cajero, Bodega) la recupera con su Encargado: el aviso de abajo lo indica.
 * La respuesta es siempre la misma, exista o no la cuenta, para no revelar qué
 * correos están registrados.
 */
export function ForgotPasswordPage() {
  const { systemName } = usePlatform();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const invalid = validateEmail(email);

    setFieldError(invalid ?? null);
    setError(null);

    if (invalid !== undefined) {
      return;
    }

    setBusy(true);

    try {
      await authService.requestPasswordReset(email.trim());
      setSent(true);
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
        <h1>Recuperar contraseña</h1>
        <p className="muted">{systemName} · sistema de gestión</p>

        {sent ? (
          <div className="alert alert--success" role="status">
            Si el correo está registrado, le enviamos un enlace para elegir una contraseña nueva.
            Revise su bandeja de entrada (y la de correo no deseado). El enlace vence en 30 minutos.
          </div>
        ) : (
          <>
            <p className="hint">
              Escriba el correo con el que inicia sesión y le enviaremos un enlace.
            </p>

            {error === null ? null : (
              <div className="alert alert--error" role="alert">
                {error}
              </div>
            )}

            <div className="field">
              <label htmlFor="forgot-email">Correo electrónico</label>
              <input
                id="forgot-email"
                type="email"
                value={email}
                autoComplete="username"
                aria-invalid={fieldError !== null}
                {...(fieldError === null ? {} : { 'aria-describedby': 'forgot-email-error' })}
                onChange={(event) => setEmail(event.target.value)}
              />
              {fieldError === null ? null : (
                <p id="forgot-email-error" className="form__error">
                  {fieldError}
                </p>
              )}
            </div>

            <button type="submit" className="button button--block" disabled={busy}>
              {busy ? 'Enviando…' : 'Enviar enlace'}
            </button>
          </>
        )}

        <p className="login__note">
          ¿Usted es cajero o de bodega? Pídale a su Encargado que restablezca su contraseña.
        </p>

        <p className="hint login__links">
          <Link to="/login">Volver a iniciar sesión</Link>
        </p>
      </form>
    </div>
  );
}
