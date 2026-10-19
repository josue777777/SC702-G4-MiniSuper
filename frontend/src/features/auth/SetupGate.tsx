import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ApiError } from '../../services/api-client';
import { authService } from '../../services/auth.service';
import type { SetupStatus } from '../../types/auth';
import { SetupStatusContext } from './setup-status-context';

/**
 * Compuerta de la configuración inicial (HU-12).
 *
 * - Sin cuenta del dueño: cualquier ruta lleva a /setup; no se usa el sistema
 *   hasta configurarlo.
 * - Con cuenta: /setup redirige a /login y no se vuelve a mostrar.
 */
export function SetupGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** `true` cuando la cuenta se creó en esta visita: el login muestra el aviso de éxito. */
  const [justConfigured, setJustConfigured] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setStatus(await authService.getSetupStatus());
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'No se pudo comprobar el estado del sistema.',
      );
    }
  }, []);

  useEffect(() => {
    // Consulta inicial al servidor: el estado depende de la base de datos.
    void refresh();
  }, [refresh]);

  const markConfigured = useCallback((): void => {
    setStatus((current) => (current === null ? current : { ...current, configured: true }));
    setJustConfigured(true);
  }, []);

  const value = useMemo(
    () => (status === null ? null : { status, markConfigured }),
    [status, markConfigured],
  );

  if (error !== null) {
    return (
      <div className="login">
        <div className="login__card">
          <h1>No se pudo iniciar</h1>
          <div className="alert alert--error" role="alert">
            {error}
          </div>
          <button type="button" className="button button--block" onClick={() => void refresh()}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (value === null) {
    return (
      <div className="login">
        <p className="muted" role="status">
          Cargando…
        </p>
      </div>
    );
  }

  if (!value.status.configured && pathname !== '/setup') {
    return <Navigate to="/setup" replace />;
  }

  if (value.status.configured && pathname === '/setup') {
    return (
      <Navigate
        to="/login"
        replace
        {...(justConfigured
          ? { state: { notice: 'Cuenta configurada. Inicie sesión con su correo y contraseña.' } }
          : {})}
      />
    );
  }

  return <SetupStatusContext.Provider value={value}>{children}</SetupStatusContext.Provider>;
}
