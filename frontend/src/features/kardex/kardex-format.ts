const BUSINESS_TIME_ZONE = 'America/Costa_Rica';

const dateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** `DD/MM/AAAA HH:mm` en la zona horaria del negocio, igual para todos los equipos. */
export function formatMovementDate(iso: string): string {
  const parts = Object.fromEntries(
    dateTime.formatToParts(new Date(iso)).map((part) => [part.type, part.value]),
  );

  return `${parts['day']}/${parts['month']}/${parts['year']} ${parts['hour']}:${parts['minute']}`;
}

/**
 * Fecha de vencimiento de un lote, `DD/MM/AAAA`, o «No vence».
 *
 * @example formatLotDate('2026-12-01'); // "01/12/2026"
 * @example formatLotDate(null);         // "No vence"
 */
export function formatLotDate(date: string | null): string {
  return date === null ? 'No vence' : date.split('-').reverse().join('/');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ¿Es un id de producto con forma válida? Se comprueba antes de pedirlo al servidor. */
export function isProductId(value: string): boolean {
  return UUID.test(value);
}

/** Estado de las existencias: una palabra y su tono de insignia. */
export interface StockStatus {
  label: 'Agotado' | 'Bajo' | 'Sobre el máximo' | 'Bien';
  tone: 'error' | 'warning' | 'ok';
}

/**
 * Cómo están las existencias de un producto, con la misma regla de la alerta
 * de stock bajo (HU-08): con mínimo, «Bajo» es estar en el mínimo o por debajo.
 *
 * @example stockStatus({ stock: 0, minStock: 5, maxStock: 0 });   // { label: 'Agotado', tone: 'error' }
 * @example stockStatus({ stock: 5, minStock: 5, maxStock: 0 });   // { label: 'Bajo', tone: 'warning' }
 * @example stockStatus({ stock: 70, minStock: 9, maxStock: 60 }); // { label: 'Sobre el máximo', tone: 'warning' }
 * @example stockStatus({ stock: 30, minStock: 9, maxStock: 60 }); // { label: 'Bien', tone: 'ok' }
 */
export function stockStatus(product: {
  stock: number;
  minStock: number;
  maxStock: number;
}): StockStatus {
  if (product.stock === 0) {
    return { label: 'Agotado', tone: 'error' };
  }

  if (product.minStock > 0 && product.stock <= product.minStock) {
    return { label: 'Bajo', tone: 'warning' };
  }

  if (product.maxStock > 0 && product.stock > product.maxStock) {
    return { label: 'Sobre el máximo', tone: 'warning' };
  }

  return { label: 'Bien', tone: 'ok' };
}
