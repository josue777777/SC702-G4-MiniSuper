import { createContext, useContext } from 'react';
import type { Profile } from '../../types/auth';

/** Aviso del login tras cerrar sesión (HU-15). */
export const SIGNED_OUT_NOTICE = 'Sesión cerrada correctamente.';
/** Aviso del login al abrir una pantalla interna sin sesión. */
export const SIGN_IN_REQUIRED_NOTICE = 'Inicie sesión para continuar.';

interface SessionValue {
  /** Dueño de la sesión verificada por el servidor. */
  user: Profile;
  /** Refleja en la barra superior los cambios guardados en «Mi perfil». */
  setUser: (user: Profile) => void;
  /** HU-15: cierra la sesión en el servidor y vuelve al login. */
  signOut: () => Promise<void>;
  signingOut: boolean;
  /** Mensaje si el servidor no pudo cerrar la sesión. */
  signOutError: string | null;
}

export const SessionContext = createContext<SessionValue | null>(null);

/** Sesión del dueño; solo disponible debajo de <RequireSession />. */
export function useSession(): SessionValue {
  const value = useContext(SessionContext);

  if (value === null) {
    throw new Error('useSession debe usarse dentro de <RequireSession />.');
  }

  return value;
}
