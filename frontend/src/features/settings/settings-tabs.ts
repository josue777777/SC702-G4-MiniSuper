import type { Permission } from '../../types/auth';

/** Pestañas de la ventana de Configuración; la abierta va en `?config=…`. */
export const SETTINGS_TABS = ['general', 'usuarios', 'apariencia'] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** Permiso que pide cada pestaña; `null` = cualquier usuario (cada uno la suya). */
export const TAB_PERMISSION: Record<SettingsTab, Permission | null> = {
  general: 'business.edit',
  usuarios: 'users.manage',
  apariencia: null,
};

/** Pestañas que el usuario puede abrir, en orden. */
export function allowedTabs(can: (permission: Permission) => boolean): SettingsTab[] {
  return SETTINGS_TABS.filter((tab) => {
    const permission = TAB_PERMISSION[tab];

    return permission === null || can(permission);
  });
}
