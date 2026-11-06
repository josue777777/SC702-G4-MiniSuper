/** Apariencia de cada usuario (Configuración › Apariencia). Refleja backend/src/types/preferences.ts. */

export type AccentColor = 'NEUTRO' | 'AZUL' | 'VERDE' | 'MORADO' | 'NARANJA' | 'GRIS';
export type FontScale = 'NORMAL' | 'GRANDE';

export interface Preferences {
  accentColor: AccentColor;
  fontScale: FontScale;
}

export const DEFAULT_PREFERENCES: Preferences = { accentColor: 'NEUTRO', fontScale: 'NORMAL' };
