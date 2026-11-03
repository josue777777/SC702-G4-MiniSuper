/**
 * Utilidades de fechas sin hora (`YYYY-MM-DD`), para los vencimientos (HU-09).
 *
 * Una fecha de vencimiento es un día del calendario, no un instante: se trabaja
 * siempre como texto `YYYY-MM-DD` y se calcula en la zona horaria del negocio,
 * para que "hoy" sea el mismo día que ve el dueño en Costa Rica aunque el
 * servidor esté en otra zona.
 */

/** Zona horaria del minisúper. */
export const BUSINESS_TIME_ZONE = 'America/Costa_Rica';

const MS_PER_DAY = 86_400_000;

/** Fecha de hoy (`YYYY-MM-DD`) en la zona horaria del negocio. */
export function todayInBusinessZone(now: Date = new Date()): string {
  // `en-CA` formatea las fechas como YYYY-MM-DD.
  return now.toLocaleDateString('en-CA', { timeZone: BUSINESS_TIME_ZONE });
}

/** Días de calendario desde `from` hasta `to` (negativo si `to` ya pasó). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

/** Convierte `YYYY-MM-DD` al `Date` que guarda la base (medianoche UTC de ese día). */
export function dateOnlyToDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Convierte el `Date` guardado de vuelta a `YYYY-MM-DD`. */
export function dateToDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Costa Rica no usa horario de verano: su medianoche siempre cae a las 06:00 UTC
 * (misma convención que el resumen del día, HU-37).
 */
const BUSINESS_MIDNIGHT_UTC = 'T06:00:00.000Z';

/**
 * Instantes `[start, end)` que cubren, en la zona del negocio, desde el inicio del
 * día `from` hasta el FINAL del día `to` (ambos incluidos): `end` es la medianoche
 * del día siguiente, así que se compara con `< end` y nada del último día se pierde.
 */
export function businessDayRange(from: string, to: string): { start: Date; end: Date } {
  return {
    start: new Date(`${from}${BUSINESS_MIDNIGHT_UTC}`),
    end: new Date(Date.parse(`${to}${BUSINESS_MIDNIGHT_UTC}`) + MS_PER_DAY),
  };
}

const businessDateTime = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Fecha y hora (`YYYY-MM-DD HH:mm`) en la zona del negocio, sin depender del idioma del servidor. */
export function formatBusinessDateTime(value: Date): string {
  const parts = Object.fromEntries(
    businessDateTime.formatToParts(value).map((part) => [part.type, part.value]),
  );

  return `${parts['year']}-${parts['month']}-${parts['day']} ${parts['hour']}:${parts['minute']}`;
}
