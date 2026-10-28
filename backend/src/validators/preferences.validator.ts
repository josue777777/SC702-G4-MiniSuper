import { z } from 'zod';
import { ACCENT_COLORS, FONT_SCALES } from '../types/preferences.js';

/** Cuerpo de `PUT /api/profile/preferences`: solo opciones de la lista. */
export const preferencesSchema = z.object({
  accentColor: z.enum(ACCENT_COLORS, { error: 'Elija uno de los colores disponibles.' }),
  fontScale: z.enum(FONT_SCALES, { error: 'Elija un tamaño de letra válido.' }),
});
