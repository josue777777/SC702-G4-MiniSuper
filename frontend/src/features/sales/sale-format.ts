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
