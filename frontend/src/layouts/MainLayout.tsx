import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { findGroupOfPath, NAVIGATION, type NavItem } from './navigation';
import { NavIcon } from './NavIcon';

function NavItemLink({ item, nested = false }: { item: NavItem; nested?: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.end ?? false}
      title={item.stories}
      className={({ isActive }) =>
        ['nav-link', nested ? 'nav-link--nested' : '', isActive ? 'nav-link--active' : '']
          .filter(Boolean)
          .join(' ')
      }
    >
      {item.icon === undefined ? null : <NavIcon name={item.icon} />}
      {item.label}
    </NavLink>
  );
}

/** En pantallas angostas el menú arranca oculto para no tapar el contenido. */
function startsWithMenuOpen(): boolean {
  return window.matchMedia('(min-width: 760px)').matches;
}

/**
 * Estructura común de todas las pantallas internas: menú lateral, barra
 * superior y contenido. El contenido de la ruta coincidente se renderiza en
 * <Outlet />.
 */
export function MainLayout() {
  const { pathname } = useLocation();
  const activeGroup = findGroupOfPath(pathname);
  /**
   * Grupos que el usuario abrió o cerró a mano. Si no lo ha tocado, un grupo
   * se ve abierto cuando contiene la pantalla actual.
   */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(startsWithMenuOpen);

  function isOpen(groupId: string): boolean {
    return toggled[groupId] ?? groupId === activeGroup;
  }

  return (
    <div className={menuOpen ? 'layout' : 'layout layout--collapsed'}>
      <aside id="main-menu" className="layout__sidebar">
        <div className="layout__brand">
          <span className="layout__brand-mark">MS</span>
          <div>
            <strong>MiniSuper</strong>
            <small>Nuevo Amanecer</small>
          </div>
        </div>

        <nav className="layout__nav" aria-label="Navegación principal">
          {NAVIGATION.map((entry) =>
            entry.kind === 'link' ? (
              <NavItemLink key={entry.to} item={entry} />
            ) : (
              <div key={entry.id} className="nav-group">
                <button
                  type="button"
                  className={
                    entry.id === activeGroup
                      ? 'nav-group__toggle nav-group__toggle--active'
                      : 'nav-group__toggle'
                  }
                  aria-expanded={isOpen(entry.id)}
                  aria-controls={`nav-group-${entry.id}`}
                  onClick={() =>
                    setToggled((current) => ({ ...current, [entry.id]: !isOpen(entry.id) }))
                  }
                >
                  <NavIcon name={entry.icon} />
                  {entry.label}
                  <span className="nav-group__chevron" aria-hidden="true">
                    ▾
                  </span>
                </button>
                {isOpen(entry.id) ? (
                  <div id={`nav-group-${entry.id}`} className="nav-group__items">
                    {entry.items.map((item) => (
                      <NavItemLink key={item.to} item={item} nested />
                    ))}
                  </div>
                ) : null}
              </div>
            ),
          )}
        </nav>

        <div className="layout__footer">
          <NavLink to="/login" className="nav-link nav-link--muted">
            <NavIcon name="user" />
            Iniciar sesión
          </NavLink>
          <small>SC-702 · Grupo 4</small>
        </div>
      </aside>

      <div className="layout__main">
        <header className="topbar">
          <button
            type="button"
            className="topbar__menu"
            aria-label={menuOpen ? 'Ocultar el menú' : 'Mostrar el menú'}
            aria-expanded={menuOpen}
            aria-controls="main-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <NavIcon name="menu" />
          </button>
          <strong className="topbar__title">MiniSuper Nuevo Amanecer</strong>
        </header>

        <main className="layout__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
