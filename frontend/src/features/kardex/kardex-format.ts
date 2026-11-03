import type { KardexReference } from '../../types/kardex';

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

/** Documento que originó el movimiento: `Venta #12`, `Pedido #7`. */
export function formatReference(reference: KardexReference | null): string {
  if (reference === null) {
    return '—';
  }

  return `${reference.type === 'SALE' ? 'Venta' : 'Pedido'} #${reference.number}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ¿Es un id de producto con forma válida? Se comprueba antes de pedirlo al servidor. */
export function isProductId(value: string): boolean {
  return UUID.test(value);
}
