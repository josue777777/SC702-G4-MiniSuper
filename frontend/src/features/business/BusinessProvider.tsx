import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { businessService } from '../../services/business.service';
import type { Business } from '../../types/business';
import { BusinessContext, FALLBACK_BUSINESS } from './business-context';

/**
 * Carga los datos del negocio y los comparte con todas las pantallas internas.
 * Si fallan (por ejemplo, con la contraseña temporal todavía sin cambiar), se
 * usan los de fábrica: nunca bloquea la aplicación.
 */
export function BusinessProvider({ children }: { children: ReactNode }) {
  const [business, setBusiness] = useState<Business>(FALLBACK_BUSINESS);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async (): Promise<void> => {
    try {
      setBusiness(await businessService.get());
    } catch {
      // Se quedan los datos que había (o los de fábrica).
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(
    () => ({ business, loaded, setBusiness, reload }),
    [business, loaded, reload],
  );

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}
