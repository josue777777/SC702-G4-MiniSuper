import type { SaleStatus } from '../../types/sales';

export function saleStatusLabel(status: SaleStatus): string {
  return {
    COMPLETED: 'Completada',
    PARTIALLY_RETURNED: 'Con devolución',
    RETURNED: 'Devuelta',
    VOID: 'Anulada',
  }[status];
}

export function formatSaleDateTime(value: string): string {
  return new Date(value).toLocaleString('es-CR', {
    timeZone: 'America/Costa_Rica',
    hourCycle: 'h23',
  });
}

/**
 * Solo la hora de la venta, en Costa Rica (el día ya está en el filtro del
 * historial).
 *
 * @example formatSaleTime('2026-11-09T05:59:59.000Z'); // "23:59:59"
 */
export function formatSaleTime(value: string): string {
  return new Date(value).toLocaleTimeString('es-CR', {
    timeZone: 'America/Costa_Rica',
    hourCycle: 'h23',
  });
}
