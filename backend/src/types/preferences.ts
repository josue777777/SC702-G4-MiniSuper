/** Apariencia que cada usuario elige para sí mismo (Configuración › Apariencia). */

export const ACCENT_COLORS = ['AZUL', 'VERDE', 'MORADO', 'NARANJA', 'GRIS'] as const;
export const FONT_SCALES = ['NORMAL', 'GRANDE'] as const;

export type AccentColor = (typeof ACCENT_COLORS)[number];
export type FontScale = (typeof FONT_SCALES)[number];

export interface PreferencesDto {
  accentColor: AccentColor;
  fontScale: FontScale;
}

/** Lo que ve un usuario que todavía no eligió nada. */
export const DEFAULT_PREFERENCES: PreferencesDto = { accentColor: 'AZUL', fontScale: 'NORMAL' };
