import { formatMoney } from '../products/money';

/**
 * Importe de una celda o total de reporte. Vacío = no aplica (`—`); un importe
 * negativo (un abono que descuenta) se muestra como `-₡100,00`, no `₡-100,00`.
 */
export function formatReportMoney(value: string | number): string {
  const text = String(value);

  if (text === '') {
    return '—';
  }

  return text.startsWith('-') ? `-${formatMoney(text.slice(1))}` : formatMoney(text);
}
