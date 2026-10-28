import { createContext, useContext } from 'react';

/** Nombre del sistema mientras se lee del servidor (o si no responde). */
export const DEFAULT_SYSTEM_NAME = 'MiniSuper';

interface PlatformValue {
  /** Nombre general del sistema: lo ven todos y solo lo cambia el Administrador. */
  systemName: string;
  /** Refleja de inmediato el nombre nuevo que guardó el Administrador. */
  setSystemName: (name: string) => void;
}

export const PlatformContext = createContext<PlatformValue>({
  systemName: DEFAULT_SYSTEM_NAME,
  setSystemName: () => undefined,
});

export function usePlatform(): PlatformValue {
  return useContext(PlatformContext);
}
