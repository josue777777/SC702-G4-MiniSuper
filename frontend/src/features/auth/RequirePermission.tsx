import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Permission } from '../../types/auth';
import { useSession } from './session-context';
import { PageHeader } from '../../components/PageHeader';

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
      <PageHeader icon="lock" title="Acceso no permitido">
        Su rol no tiene acceso a esta sección.
      </PageHeader>

      <section className="card">
        <p className="muted">
          Si necesita usarla, pídale al administrador que revise su rol. Puede volver al{' '}
          <Link to="/">panel principal</Link>.
        </p>
      </section>
    </>
  );
}
