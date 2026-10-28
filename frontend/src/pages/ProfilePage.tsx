import { Navigate } from 'react-router-dom';
import { useSession } from '../features/auth/session-context';
import { ProfileForm } from '../features/profile/ProfileForm';
import { useProfile } from '../features/profile/use-profile';

/**
 * Perfil del usuario: nombre, correo y contraseña (HU-14). Requiere sesión.
 * Con una contraseña temporal es la única pantalla disponible hasta cambiarla.
 */
export function ProfilePage() {
  const { phase, profile, loadError, reload, save } = useProfile();
  const { user } = useSession();

  if (phase === 'unauthenticated') {
    return (
      <Navigate
        to="/login"
        replace
        state={{ notice: 'Inicie sesión para ver y editar su perfil.' }}
      />
    );
  }

  return (
    <>
      <header className="page-header">
        <h1>Mi perfil</h1>
        <p>Mantenga actualizados su nombre, su correo y su contraseña.</p>
      </header>

      {user.mustChangePassword ? (
        <div className="alert alert--warning" role="alert">
          Está usando una contraseña temporal. Para continuar, cree su propia contraseña: escriba la
          nueva, confírmela y ponga la temporal en «Contraseña actual».
        </div>
      ) : null}

      {phase === 'loading' ? (
        <p className="muted" role="status">
          Cargando perfil…
        </p>
      ) : null}

      {phase === 'error' ? (
        <div className="alert alert--error" role="alert">
          {loadError}{' '}
          <button type="button" className="button" onClick={() => void reload()}>
            Reintentar
          </button>
        </div>
      ) : null}

      {phase === 'ready' && profile !== null ? (
        <ProfileForm profile={profile} save={save} mustChangePassword={user.mustChangePassword} />
      ) : null}
    </>
  );
}
