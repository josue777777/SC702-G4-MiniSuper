import type { CreditSummary, Payment, PaymentPayload, PaymentResult } from '../types/credit';
import { apiGet, apiPost } from './api-client';

interface DataResponse<T> {
  data: T;
}

/** Cuentas por cobrar y abonos de los clientes (HU-19). */
export const creditService = {
  /** Deuda actual del cliente y sus fiados. 404 si no existe (o es de otro negocio). */
  async get(customerId: string): Promise<CreditSummary> {
    return (
      await apiGet<DataResponse<CreditSummary>>(
        `/api/customers/${encodeURIComponent(customerId)}/credit`,
      )
    ).data;
  },

  /** Historial de abonos, del más reciente al más antiguo. */
  async listPayments(customerId: string): Promise<Payment[]> {
    return (
      await apiGet<DataResponse<Payment[]>>(
        `/api/customers/${encodeURIComponent(customerId)}/payments`,
      )
    ).data;
  },

  /**
   * Registra un abono. El servidor valida y reparte; si el saldo cambió o el pago supera
   * la deuda responde 409 con el motivo y NO guarda nada.
   */
  async registerPayment(customerId: string, payload: PaymentPayload): Promise<PaymentResult> {
    return (
      await apiPost<DataResponse<PaymentResult>>(
        `/api/customers/${encodeURIComponent(customerId)}/payments`,
        payload,
      )
    ).data;
  },
};
