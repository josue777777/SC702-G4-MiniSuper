import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { businessService } from '../../services/business.service';
import type { BusinessSettings } from '../../types/business';
import { BusinessContext, FALLBACK_BUSINESS } from './business-context';

/**
 * Carga una vez los datos del negocio y los comparte con todas las pantallas
 * internas. Si fallan (por ejemplo, con la contraseña temporal todavía sin
 * cambiar), se usan los de fábrica: nunca bloquea la aplicación.
 */
export function BusinessProvider({ children }: { children: ReactNode }) {
  const [business, setBusiness] = useState<BusinessSettings>(FALLBACK_BUSINESS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    businessService
      .get()
      .then((loaded) => {
        if (!cancelled) {
          setBusiness(loaded);
        }
      })
      .catch(() => {
        // Se quedan los datos de fábrica.
      })
      .finally(() => {
        if (!cancelled) {
          setLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => ({ business, loaded, setBusiness }), [business, loaded]);

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}
