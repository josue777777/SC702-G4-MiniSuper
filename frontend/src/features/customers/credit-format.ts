import type { PaymentResult } from '../../types/credit';
import { formatMoney } from '../products/money';

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

/**
 * Mensaje de confirmación de un abono: lo abonado y cómo quedó la cuenta
 * (saldo pendiente, o «Cuenta saldada»). Si el servidor dijo que esa misma
 * operación ya estaba registrada, lo dice: no se cobró de nuevo.
 */
export function paymentMessage(result: PaymentResult): string {
  const paid = formatMoney(result.payment.amount);

  if (result.replayed) {
    return `Este abono de ${paid} ya estaba registrado; no se cobró de nuevo.`;
  }

  return result.credit.settled
    ? `Abono de ${paid} registrado correctamente. El cliente ya no tiene fiados pendientes. Cuenta saldada.`
    : `Abono de ${paid} registrado correctamente. Saldo pendiente: ${formatMoney(result.credit.balance)}.`;
}
