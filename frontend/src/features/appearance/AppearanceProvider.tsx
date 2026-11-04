import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { preferencesService } from '../../services/preferences.service';
import { DEFAULT_PREFERENCES, type Preferences } from '../../types/preferences';
import { AppearanceContext } from './appearance-context';

/**
 * Aplica la apariencia del usuario a toda la página con atributos en `<html>`
 * (`data-accent`, `data-font-scale`) que el CSS usa para cambiar colores y
 * tamaño. Al cerrar sesión los quita: el login siempre se ve igual.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<Preferences>(DEFAULT_PREFERENCES);
  /** Vista previa sin guardar; `null` = se muestra lo guardado. */
  const [draft, setDraft] = useState<Preferences | null>(null);
  const applied = draft ?? saved;

  useEffect(() => {
    let cancelled = false;

    preferencesService
      .get()
      .then((loaded) => {
        if (!cancelled) {
          setSaved(loaded);
        }
      })
      .catch(() => {
        // Se queda la apariencia de fábrica.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    root.dataset['accent'] = applied.accentColor.toLowerCase();
    root.dataset['fontScale'] = applied.fontScale.toLowerCase();

    return () => {
      delete root.dataset['accent'];
      delete root.dataset['fontScale'];
    };
  }, [applied.accentColor, applied.fontScale]);

  const save = useCallback(async (next: Preferences): Promise<void> => {
    const stored = await preferencesService.update(next);

    setSaved(stored);
    setDraft(null);
  }, []);

  const value = useMemo(() => ({ saved, preview: setDraft, save }), [saved, save]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
