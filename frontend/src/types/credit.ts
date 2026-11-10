/**
 * Contratos de las cuentas por cobrar: deuda del cliente y abonos (HU-19).
 * Reflejan backend/src/types/credit.ts.
 *
 * Dinero: cadenas con dos decimales (`"1500.00"`); el formateo para mostrarlo
 * vive en `features/products/money.ts`.
 */

export interface CreditCustomer {
  id: string;
  name: string;
  phone: string | null;
  isActive: boolean;
}

export type FiadoStatus = 'PENDING' | 'PARTIAL' | 'SETTLED';

export interface Fiado {
  saleId: string;
  number: number;
  /** Fecha y hora de la venta (ISO 8601). */
  createdAt: string;
  originalAmount: string;
  effectiveAmount: string;
  paidAmount: string;
  pendingAmount: string;
  status: FiadoStatus;
}

export interface CreditSummary {
  customer: CreditCustomer;
  /** Deuda actual (nunca negativa). */
  balance: string;
  totalCredited: string;
  totalPaid: string;
  /** Abonos anteriores a HU-19 sin venta asignada. */
  unassignedPaid: string;
  /** `true` si el cliente tiene fiados y ya no debe nada. */
  settled: boolean;
  /** `true` si el cliente tiene al menos una venta a crédito. */
  hasCredit: boolean;
  /** Fiados vigentes, del más antiguo al más reciente. */
  fiados: Fiado[];
}

export interface PaymentAllocation {
  saleId: string | null;
  saleNumber: number | null;
  amount: string;
}

export interface Payment {
  id: string;
  /** `OPERATION`: registrado con HU-19. `LEGACY`: abono anterior, sin venta asignada. */
  kind: 'OPERATION' | 'LEGACY';
  /** Día del pago (`YYYY-MM-DD`). */
  paymentDate: string;
  /** Cuándo se registró (ISO 8601). */
  createdAt: string;
  amount: string;
  notes: string | null;
  allocations: PaymentAllocation[];
}

export interface PaymentPayload {
  /** Llave de este intento de cobro: reenviarla no cobra dos veces. */
  idempotencyKey: string;
  amount: string;
  paymentDate: string;
  notes?: string;
  /** Fiado elegido; sin él se reparte entre los más antiguos primero. */
  saleId?: string;
}

export interface PaymentResult {
  payment: Payment;
  credit: CreditSummary;
  /** `true` si la llave ya estaba usada con los mismos datos: no se cobró de nuevo. */
  replayed: boolean;
}
