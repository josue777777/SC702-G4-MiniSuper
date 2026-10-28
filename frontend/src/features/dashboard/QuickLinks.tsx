import { Link } from 'react-router-dom';
import { NavIcon } from '../../layouts/NavIcon';
import type { NavIconName } from '../../layouts/navigation';
import type { Permission } from '../../types/auth';
import { useSession } from '../auth/session-context';

interface QuickLink {
  to: string;
  label: string;
  icon: NavIconName;
  /** El mismo permiso que la opción del menú. */
  permission: Permission;
  /** `true` si la pantalla todavía es un espacio reservado (historias pendientes). */
  pending?: boolean;
}

/** Accesos rápidos a cada sección, en el orden del menú. */
const LINKS: QuickLink[] = [
  { to: '/inventory', label: 'Inventario', icon: 'warehouse', permission: 'inventory.read' },
  { to: '/kardex', label: 'Kardex', icon: 'list', permission: 'kardex', pending: true },
  { to: '/orders', label: 'Pedidos a proveedor', icon: 'cart', permission: 'purchasing' },
  { to: '/suppliers', label: 'Proveedores', icon: 'truck', permission: 'purchasing' },
  { to: '/sales', label: 'Ventas', icon: 'cash', permission: 'sales' },
  { to: '/customers', label: 'Clientes y fiados', icon: 'users', permission: 'customers' },
  {
    to: '/reports',
    label: 'Reportes',
    icon: 'reports',
    permission: 'reports.inventory',
    pending: true,
  },
];

/** Cuadrícula de accesos del panel; cada rol ve solo los suyos. */
export function QuickLinks() {
  const { can } = useSession();

  return (
    <section className="card">
      <header className="card__header">
        <h2>Accesos rápidos</h2>
      </header>
      <nav className="quick-links" aria-label="Accesos rápidos">
        {LINKS.filter((link) => can(link.permission)).map((link) => (
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
