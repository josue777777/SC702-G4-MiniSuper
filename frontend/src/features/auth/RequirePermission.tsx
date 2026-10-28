import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Permission } from '../../types/auth';
import { useSession } from './session-context';

/**
 * Pantalla que pide un permiso del rol. Si alguien escribe la dirección a mano
 * sin tenerlo, ve «Acceso no permitido» en lugar de la pantalla. Es solo para
 * la experiencia: aunque se saltara, la API responde 403 a sus peticiones.
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { can } = useSession();

  if (can(permission)) {
    return children;
  }

  return (
    <>
      <header className="page-header">
        <h1>Acceso no permitido</h1>
        <p>Su rol no tiene acceso a esta sección.</p>
      </header>

      <section className="card">
        <p className="muted">
          Si necesita usarla, pídale al administrador que revise su rol. Puede volver al{' '}
          <Link to="/">panel principal</Link>.
        </p>
      </section>
    </>
  );
}
