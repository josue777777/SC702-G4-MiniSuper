import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { platformService } from '../../services/platform.service';
import { DEFAULT_SYSTEM_NAME, PlatformContext } from './platform-context';

/**
 * Lee el nombre del sistema (público, sin sesión) para el login y el menú. Si
 * el servidor no responde, se usa el nombre de fábrica: nunca bloquea.
 */
export function PlatformProvider({ children }: { children: ReactNode }) {
  const [systemName, setSystemName] = useState(DEFAULT_SYSTEM_NAME);

  useEffect(() => {
    platformService
      .getSystemName()
      .then(setSystemName)
      .catch(() => {
        // Se queda el nombre de fábrica.
      });
  }, []);

  const value = useMemo(() => ({ systemName, setSystemName }), [systemName]);

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}
