import { createContext, useContext } from 'react';
import type { Business } from '../../types/business';

/** Lo que se muestra mientras cargan los datos o si no se pudieron leer. */
export const FALLBACK_BUSINESS: Business = {
  name: 'Abastecedor Nuevo Amanecer',
  legalId: null,
  phone: null,
  email: null,
  address: null,
  receiptMessage: '¡Gracias por su compra!',
  logoUrl: null,
  plan: { maxUsers: 0, usedSeats: 0 },
};

interface BusinessValue {
  business: Business;
  /** `true` cuando ya se leyeron del servidor (o falló y quedan los de fábrica). */
  loaded: boolean;
  /** Refleja en toda la aplicación lo que se acaba de guardar en Configuración. */
  setBusiness: (business: Business) => void;
  /** Vuelve a leerlos (por ejemplo, los cupos del plan después de crear un usuario). */
  reload: () => Promise<void>;
}

export const BusinessContext = createContext<BusinessValue>({
  business: FALLBACK_BUSINESS,
  loaded: false,
  setBusiness: () => undefined,
  reload: () => Promise.resolve(),
});

/** Datos del negocio (nombre, logo, plan…) para el menú, el comprobante y Configuración. */
export function useBusiness(): BusinessValue {
  return useContext(BusinessContext);
}
