import { createContext, useContext } from 'react';
import type { BusinessSettings } from '../../types/business';

/** Lo que se muestra mientras cargan los datos o si no se pudieron leer. */
export const FALLBACK_BUSINESS: BusinessSettings = {
  name: 'Abastecedor Nuevo Amanecer',
  legalId: null,
  phone: null,
  email: null,
  address: null,
  receiptMessage: '¡Gracias por su compra!',
};

interface BusinessValue {
  business: BusinessSettings;
  /** `true` cuando ya se leyeron del servidor (o falló y quedan los de fábrica). */
  loaded: boolean;
  /** Refleja en toda la aplicación lo que se acaba de guardar en Configuración. */
  setBusiness: (business: BusinessSettings) => void;
}

export const BusinessContext = createContext<BusinessValue>({
  business: FALLBACK_BUSINESS,
  loaded: false,
  setBusiness: () => undefined,
});

/** Datos del negocio (nombre, cédula, teléfono…) para el menú y el comprobante. */
export function useBusiness(): BusinessValue {
  return useContext(BusinessContext);
}
