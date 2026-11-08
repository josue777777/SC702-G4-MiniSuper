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

/** Cantidad de una columna de entradas o salidas: vacía (`—`) cuando no aplica. */
export function formatQuantity(value: number): string {
  return value === 0 ? '—' : value.toLocaleString('es-CR');
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
