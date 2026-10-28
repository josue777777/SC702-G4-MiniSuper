import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { businessService } from '../../services/business.service';
import { useSession } from '../auth/session-context';
import type { Business } from '../../types/business';
import { BusinessContext, FALLBACK_BUSINESS } from './business-context';

/**
 * Carga los datos del negocio del usuario y los comparte con todas las
 * pantallas internas. Si fallan (por ejemplo, con la contraseña temporal
 * todavía sin cambiar), se usan los de fábrica: nunca bloquea la aplicación.
 * El Administrador es de la plataforma y no tiene negocio: no se piden.
 */
export function BusinessProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  /**
   * Con la contraseña temporal la API todavía no entrega el negocio: se vuelve
   * a pedir apenas la cambia (y si cambia el usuario de la sesión).
   */
  const hasBusiness = user.businessId !== null && !user.mustChangePassword;
  const [business, setBusiness] = useState<Business>(FALLBACK_BUSINESS);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async (): Promise<void> => {
    if (!hasBusiness) {
      setLoaded(true);

      return;
    }

    try {
      setBusiness(await businessService.get());
    } catch {
      // Se quedan los datos que había (o los de fábrica).
    } finally {
      setLoaded(true);
    }
  }, [hasBusiness]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(
    () => ({ business, loaded, setBusiness, reload }),
    [business, loaded, reload],
  );

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}
