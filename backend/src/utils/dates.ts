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
