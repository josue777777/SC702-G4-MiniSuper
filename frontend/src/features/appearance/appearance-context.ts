import { createContext, useContext } from 'react';
import { DEFAULT_PREFERENCES, type Preferences } from '../../types/preferences';

interface AppearanceValue {
  /** Lo guardado en la cuenta del usuario. */
  saved: Preferences;
  /**
   * Muestra una apariencia sin guardarla (vista previa mientras se elige).
   * `null` quita la vista previa y vuelve a lo guardado.
   */
  preview: (preferences: Preferences | null) => void;
  /** Guarda en la cuenta del usuario: lo acompaña en cualquier computadora. */
  save: (preferences: Preferences) => Promise<void>;
}

export const AppearanceContext = createContext<AppearanceValue>({
  saved: DEFAULT_PREFERENCES,
  preview: () => undefined,
  save: () => Promise.resolve(),
});

export function useAppearance(): AppearanceValue {
  return useContext(AppearanceContext);
}
