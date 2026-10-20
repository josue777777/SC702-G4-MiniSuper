import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../services/api-client';
import { authService } from '../../services/auth.service';
import type { Profile } from '../../types/auth';
import { SessionContext, SIGN_IN_REQUIRED_NOTICE, SIGNED_OUT_NOTICE } from './session-context';

type SessionState =
  | { phase: 'checking' }
  | { phase: 'ready'; user: Profile }
  | { phase: 'signed-out' }
  | { phase: 'error'; message: string };

/**
 * Compuerta de las pantallas internas (HU-15; base de HU-11).
 *
 * Nada privado se pinta hasta que el servidor confirma la sesión. Se vuelve a
 * preguntar al cambiar de pantalla, al volver a la pestaña y cuando el navegador
 * restaura la página desde su caché (botón «Atrás»): si la sesión se cerró,
 * se redirige al login en vez de mostrar lo que estaba cargado.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState<SessionState>({ phase: 'checking' });
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const verify = useCallback(async (): Promise<void> => {
    try {
      const user = await authService.getSession();

      setState({ phase: 'ready', user });
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setState({ phase: 'signed-out' });
        return;
      }

      // Un fallo de red no debe dejar ver datos: se oculta todo hasta reintentar.
      setState({
        phase: 'error',
        message: caught instanceof ApiError ? caught.message : 'No se pudo comprobar la sesión.',
      });
    }
  }, []);

  useEffect(() => {
    void verify();
  }, [verify, pathname]);

  useEffect(() => {
    function onPageShow(event: PageTransitionEvent): void {
      if (event.persisted) {
        setState({ phase: 'checking' });
        void verify();
      }
    }

    function onFocus(): void {
      void verify();
    }

    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onFocus);
    };
  }, [verify]);

  const setUser = useCallback((user: Profile): void => {
    setState({ phase: 'ready', user });
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    setSigningOut(true);
    setSignOutError(null);

    try {
      await authService.logout();
    } catch (caught) {
      // Si el servidor no confirmó, la cookie sigue viva: no se finge el cierre.
      setSignOutError(
        caught instanceof ApiError
          ? `No se pudo cerrar la sesión: ${caught.message}`
          : 'No se pudo cerrar la sesión. Intente de nuevo.',
      );
      setSigningOut(false);
      return;
    }

    navigate('/login', { replace: true, state: { notice: SIGNED_OUT_NOTICE } });
  }, [navigate]);

  const value = useMemo(
    () =>
      state.phase === 'ready'
        ? { user: state.user, setUser, signOut, signingOut, signOutError }
        : null,
    [state, setUser, signOut, signingOut, signOutError],
  );

  if (state.phase === 'signed-out') {
    return <Navigate to="/login" replace state={{ notice: SIGN_IN_REQUIRED_NOTICE }} />;
  }

  if (state.phase === 'error') {
    return (
      <div className="login">
        <div className="login__card">
          <h1>No se pudo continuar</h1>
          <div className="alert alert--error" role="alert">
            {state.message}
          </div>
          <button
            type="button"
            className="button button--block"
            onClick={() => {
              setState({ phase: 'checking' });
              void verify();
            }}
          >
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
          Verificando sesión…
        </p>
      </div>
    );
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
