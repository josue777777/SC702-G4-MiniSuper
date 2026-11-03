const BUSINESS_TIME_ZONE = 'America/Costa_Rica';

const day = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** `DD/MM/AAAA` de un instante, en la zona horaria del negocio (igual para todos los equipos). */
export function formatFiadoDate(iso: string): string {
  return day.format(new Date(iso));
}

/** `AAAA-MM-DD` → `DD/MM/AAAA`, sin desfase de zona horaria. */
export function formatPaymentDay(value: string): string {
  const [year, month, dayOfMonth] = value.split('-');

  return `${dayOfMonth}/${month}/${year}`;
}
