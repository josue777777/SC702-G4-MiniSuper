import { NavLink, Outlet } from 'react-router-dom';

/**
 * Secciones del sistema. El `href` coincide con la ruta y con el módulo de
 * docs/ARCHITECTURE.md, de modo que el menú es también el índice del proyecto.
 */
const NAV_ITEMS = [
  { to: '/', label: 'Panel', end: true },
  { to: '/products', label: 'Productos' },
  { to: '/inventory', label: 'Inventario' },
  { to: '/sales', label: 'Ventas' },
  { to: '/customers', label: 'Clientes' },
  { to: '/suppliers', label: 'Proveedores' },
  { to: '/orders', label: 'Pedidos' },
  { to: '/reports', label: 'Reportes' },
] as const;

/**
 * Estructura común de todas las pantallas internas: menú lateral + contenido.
 * El contenido de la ruta coincidente se renderiza en <Outlet />.
 */
export function MainLayout() {
  return (
    <div className="layout">
      <aside className="layout__sidebar">
        <div className="layout__brand">
          <span className="layout__brand-mark">MS</span>
          <div>
            <strong>MiniSuper</strong>
            <small>Nuevo Amanecer</small>
          </div>
        </div>

        <nav className="layout__nav" aria-label="Navegación principal">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : false}
              className={({ isActive }) => (isActive ? 'nav-link nav-link--active' : 'nav-link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="layout__footer">
          <NavLink to="/login" className="nav-link nav-link--muted">
            Iniciar sesión
          </NavLink>
          <small>SC-702 · Grupo 4</small>
        </div>
      </aside>

      <main className="layout__content">
        <Outlet />
      </main>
    </div>
  );
}
