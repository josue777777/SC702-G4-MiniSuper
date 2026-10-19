import { createContext, useContext } from 'react';
import type { SetupStatus } from '../../types/auth';

interface SetupStatusValue {
  status: SetupStatus;
  /**
   * Marca el sistema como configurado tras crear la cuenta. La compuerta redirige
   * entonces a /login con el aviso de éxito.
   */
  markConfigured: () => void;
}

export const SetupStatusContext = createContext<SetupStatusValue | null>(null);

/** Estado de la configuración inicial; solo disponible debajo de <SetupGate />. */
export function useSetupStatus(): SetupStatusValue {
  const value = useContext(SetupStatusContext);

  if (value === null) {
    throw new Error('useSetupStatus debe usarse dentro de <SetupGate />.');
  }

  return value;
}
