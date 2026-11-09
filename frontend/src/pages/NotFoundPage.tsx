import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

/**
 * Ruta desconocida. En lugar de una página en blanco, devuelve al dueño a la
 * pantalla principal, que es la que siempre funciona.
 */
export function NotFoundPage() {
  return (
    <>
      <PageHeader icon="compass" title="Página no encontrada">
        La dirección a la que intentó entrar no existe en el sistema.
      </PageHeader>

      <section className="card">
        <p className="muted">
          Verifique la barra de direcciones o regrese al <Link to="/">panel de control</Link>.
        </p>
      </section>
    </>
  );
}
