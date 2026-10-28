import { useState } from 'react';
import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { useSession } from '../features/auth/session-context';
import { useBusiness } from '../features/business/business-context';
import { BusinessProvider } from '../features/business/BusinessProvider';
import { SETTINGS_TABS, type SettingsTab } from '../features/settings/settings-tabs';
import { SettingsWindow } from '../features/settings/SettingsWindow';
import { ROLE_LABELS } from '../features/users/roles';
import { findGroupOfPath, visibleNavigation, type NavItem } from './navigation';
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
 * <Outlet />. Solo se muestra con sesión (lo garantiza <RequireSession />).
 * El menú depende del rol: cada usuario ve solo las secciones que puede usar.
 * Los datos del negocio se cargan aquí una vez para todas las pantallas.
 */
export function MainLayout() {
  return (
    <BusinessProvider>
      <Layout />
    </BusinessProvider>
  );
}

/** Pestaña de Configuración abierta según la dirección (`?config=usuarios`), o `null`. */
function settingsTabFrom(params: URLSearchParams): SettingsTab | null {
  const value = params.get('config');

  return SETTINGS_TABS.find((tab) => tab === value) ?? null;
}

function Layout() {
  const { pathname } = useLocation();
  const activeGroup = findGroupOfPath(pathname);
  const { user, can, signOut, signingOut, signOutError } = useSession();
  const { business } = useBusiness();
  const [params, setParams] = useSearchParams();
  const settingsTab = settingsTabFrom(params);

  function openSettings(tab: SettingsTab): void {
    setParams((current) => {
      const next = new URLSearchParams(current);

      next.set('config', tab);

      return next;
    });
  }

  function closeSettings(): void {
    setParams((current) => {
      const next = new URLSearchParams(current);

      next.delete('config');

      return next;
    });
  }
  const navigation = visibleNavigation(can);
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
            <small title={business.name}>{business.name}</small>
          </div>
        </div>

        <nav className="layout__nav" aria-label="Navegación principal">
          {navigation.map((entry) =>
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

          {/* Abre una ventana sobre la pantalla actual, no cambia de pantalla. */}
          {can('settings') ? (
            <button
              type="button"
              className={
                settingsTab === null
                  ? 'nav-group__toggle'
                  : 'nav-group__toggle nav-group__toggle--active'
              }
              aria-haspopup="dialog"
              onClick={() => openSettings('general')}
            >
              <NavIcon name="settings" />
              Configuración
            </button>
          ) : null}
        </nav>

        <div className="layout__footer">
          <NavLink to="/profile" className="nav-link nav-link--muted">
            <NavIcon name="user" />
            Mi perfil
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
          <strong className="topbar__title">{business.name}</strong>
          {/* HU-15: siempre a la vista, aunque el menú lateral esté oculto. */}
          <div className="topbar__session">
            <span className="topbar__user" title={user.email}>
              {user.name}
              <small className="topbar__role">{ROLE_LABELS[user.role]}</small>
            </span>
            <button
              type="button"
              className="button topbar__logout"
              disabled={signingOut}
              onClick={() => void signOut()}
            >
              <NavIcon name="logout" size={18} />
              {signingOut ? 'Cerrando…' : 'Cerrar sesión'}
            </button>
          </div>
        </header>

        {signOutError === null ? null : (
          <div className="alert alert--error layout__alert" role="alert">
            {signOutError}
          </div>
        )}

        <main className="layout__content">
          <Outlet />
        </main>

        {settingsTab === null ? null : (
          <SettingsWindow tab={settingsTab} onTabChange={openSettings} onClose={closeSettings} />
        )}
      </div>
    </div>
  );
}
