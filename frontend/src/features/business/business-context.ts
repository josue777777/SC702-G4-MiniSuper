import { createContext, useContext } from 'react';
import type { Business } from '../../types/business';

/**
 * Lo que se muestra mientras cargan los datos o si no se pudieron leer. Sin
 * nombre: con varios negocios, uno «de fábrica» sería el de otro cliente.
 */
export const FALLBACK_BUSINESS: Business = {
  name: '',
  legalId: null,
  phone: null,
  email: null,
  address: null,
  receiptMessage: '¡Gracias por su compra!',
  logoUrl: null,
  plan: { extraUsers: 0, maxUsers: 1, usedSeats: 0 },
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
