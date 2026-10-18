import { Link } from 'react-router-dom';
import { NavIcon } from '../../layouts/NavIcon';
import type { NavIconName } from '../../layouts/navigation';

interface QuickLink {
  to: string;
  label: string;
  icon: NavIconName;
  /** `true` si la pantalla todavía es un espacio reservado (historias pendientes). */
  pending?: boolean;
}

/** Accesos rápidos a cada sección, en el orden del menú. */
const LINKS: QuickLink[] = [
  { to: '/inventory', label: 'Inventario', icon: 'warehouse' },
  { to: '/kardex', label: 'Kardex', icon: 'list', pending: true },
  { to: '/orders', label: 'Pedidos a proveedor', icon: 'cart' },
  { to: '/suppliers', label: 'Proveedores', icon: 'truck' },
  { to: '/sales', label: 'Ventas', icon: 'cash', pending: true },
  { to: '/customers', label: 'Clientes y fiados', icon: 'users', pending: true },
  { to: '/reports', label: 'Reportes', icon: 'reports', pending: true },
];

/** Cuadrícula de accesos del panel, como los botones grandes de la referencia. */
export function QuickLinks() {
  return (
    <section className="card">
      <header className="card__header">
        <h2>Accesos rápidos</h2>
      </header>
      <nav className="quick-links" aria-label="Accesos rápidos">
        {LINKS.map((link) => (
          <Link key={link.to} to={link.to} className="quick-links__item">
            <NavIcon name={link.icon} size={30} />
            <span>{link.label}</span>
            {link.pending ? <small className="badge badge--muted">En construcción</small> : null}
          </Link>
        ))}
      </nav>
    </section>
  );
}
