import { Modal } from '../../components/Modal';
import { NavIcon } from '../../layouts/NavIcon';
import type { NavIconName } from '../../layouts/navigation';
import { RequirePermission } from '../auth/RequirePermission';
import { useBusiness } from '../business/business-context';
import { UsersPanel } from '../users/UsersPanel';
import { BusinessForm } from './BusinessForm';
import { SETTINGS_TABS, type SettingsTab } from './settings-tabs';

const TAB_INFO: Record<SettingsTab, { label: string; icon: NavIconName }> = {
  general: { label: 'General', icon: 'settings' },
  usuarios: { label: 'Usuarios', icon: 'users' },
};

interface SettingsWindowProps {
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onClose: () => void;
}

/**
 * Ventana de Configuración (solo Administrador), con el mismo estilo de
 * ventana y pestañas que el formulario de producto:
 *   - General: datos del negocio.
 *   - Usuarios: crear, editar, desactivar y restablecer contraseñas.
 * Se abre sobre la pantalla en la que se esté y su pestaña queda en la
 * dirección (`?config=usuarios`), así se puede volver a ella con «Atrás».
 */
export function SettingsWindow({ tab, onTabChange, onClose }: SettingsWindowProps) {
  const { loaded } = useBusiness();

  return (
    <Modal title="Configuración" onClose={onClose} size="wide">
      <RequirePermission permission="settings">
        <div className="tabs" role="tablist" aria-label="Secciones de la configuración">
          {SETTINGS_TABS.map((item) => (
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
          {tab === 'usuarios' ? <UsersPanel /> : null}
          {/* El formulario arranca con los datos ya leídos, no con los de fábrica. */}
          {tab === 'general' && loaded ? <BusinessForm /> : null}
          {tab === 'general' && !loaded ? (
            <p className="muted" role="status">
              Cargando datos del negocio…
            </p>
          ) : null}
        </div>
      </RequirePermission>
    </Modal>
  );
}
