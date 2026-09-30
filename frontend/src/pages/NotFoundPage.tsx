import { Link } from 'react-router-dom';

/**
 * Ruta desconocida. En lugar de una página en blanco, devuelve al dueño a la
 * pantalla principal, que es la que siempre funciona.
 */
export function NotFoundPage() {
  return (
    <>
      <header className="page-header">
        <h1>Página no encontrada</h1>
        <p>La dirección a la que intentó entrar no existe en el sistema.</p>
      </header>

      <section className="card">
        <p className="muted">
          Verifique la barra de direcciones o regrese al <Link to="/">panel de control</Link>.
        </p>
      </section>
    </>
  );
}
