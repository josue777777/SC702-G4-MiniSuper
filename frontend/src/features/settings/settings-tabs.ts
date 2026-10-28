/** Pestañas de la ventana de Configuración; la abierta va en `?config=…`. */
export const SETTINGS_TABS = ['general', 'usuarios'] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];
