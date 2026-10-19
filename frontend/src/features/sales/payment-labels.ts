import type { PaymentMethod } from '../../types/sales';

/** Nombre del método de pago tal como lo ve el cajero (CREDIT se llama «Fiado»). */
export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  CREDIT: 'Fiado',
};
