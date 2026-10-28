import { Modal } from '../../components/Modal';
import { NavIcon } from '../../layouts/NavIcon';
import type { NavIconName } from '../../layouts/navigation';
import { RequirePermission } from '../auth/RequirePermission';
import { useSession } from '../auth/session-context';
import { useBusiness } from '../business/business-context';
import { UsersPanel } from '../users/UsersPanel';
import { AppearancePanel } from './AppearancePanel';
import { BusinessForm } from './BusinessForm';
import { PlatformSettingsForm } from './PlatformSettingsForm';
import { allowedTabs, TAB_PERMISSION, type SettingsTab } from './settings-tabs';

const TAB_INFO: Record<SettingsTab, { label: string; icon: NavIconName }> = {
  general: { label: 'General', icon: 'settings' },
  plataforma: { label: 'Plataforma', icon: 'settings' },
  usuarios: { label: 'Usuarios', icon: 'users' },
  apariencia: { label: 'Apariencia', icon: 'user' },
};

interface SettingsWindowProps {
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onClose: () => void;
}

/**
 * Ventana de Configuración, con pestañas según lo que permite el rol:
 *   - General (Encargado): datos, logo y plan de su negocio.
 *   - Plataforma (Administrador): nombre del sistema y precio por usuario.
 *   - Usuarios (Administrador y Encargado): con jerarquía; el Administrador
 *     maneja administradores y Encargados, el Encargado a Cajero y Bodega.
 *   - Apariencia (todos): color y tamaño de letra de cada usuario.
 * Se abre sobre la pantalla en la que se esté; su pestaña queda en la
 * dirección (`?config=usuarios`).
 */
export function SettingsWindow({ tab, onTabChange, onClose }: SettingsWindowProps) {
  const { can } = useSession();
  const { loaded } = useBusiness();
  const tabs = allowedTabs(can);
  const permission = TAB_PERMISSION[tab];

  return (
    <Modal title="Configuración" onClose={onClose} size="wide">
      <div className="tabs" role="tablist" aria-label="Secciones de la configuración">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            id={`settings-tab-${item}`}
            aria-selected={tab === item}
            aria-controls={`settings-panel-${item}`}
            className={tab === item ? 'tabs__tab tabs__tab--active' : 'tabs__tab'}
            onClick={() => onTabChange(item)}
          >
            <span className="tabs__label">
              <NavIcon name={TAB_INFO[item].icon} size={16} />
              {TAB_INFO[item].label}
            </span>
          </button>
        ))}
      </div>

      <div
        className="tabs__panel"
        role="tabpanel"
        id={`settings-panel-${tab}`}
        aria-labelledby={`settings-tab-${tab}`}
      >
        {/* Una dirección escrita a mano con una pestaña ajena muestra «Acceso no permitido». */}
        {permission === null ? (
          <AppearancePanel />
        ) : (
          <RequirePermission permission={permission}>
            {tab === 'usuarios' ? <UsersPanel /> : null}
            {tab === 'plataforma' ? <PlatformSettingsForm /> : null}
            {tab === 'general' && loaded ? <BusinessForm /> : null}
            {tab === 'general' && !loaded ? (
              <p className="muted" role="status">
                Cargando datos del negocio…
              </p>
            ) : null}
          </RequirePermission>
        )}
      </div>
    </Modal>
  );
}
