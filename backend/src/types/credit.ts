import type { PaymentDecision, PaymentRejection } from '../services/credit.js';

/**
 * Contratos de las cuentas por cobrar: deuda del cliente y abonos (HU-19).
 * El frontend mantiene su copia en `frontend/src/types/credit.ts`.
 *
 * Dinero: cadenas con dos decimales (`"1500.00"`), como en `types/sales.ts`.
 */

/** Importe tal como lo entrega Prisma (`Decimal`): solo se necesita `toFixed`. */
interface DecimalLike {
  toFixed(digits: number): string;
}

export interface CreditCustomerRef {
  id: string;
  name: string;
  phone: string | null;
  isActive: boolean;
}

/** Venta a crédito con lo necesario para saber cuánto se debe de ella. */
export interface CreditSaleRow {
  id: string;
  number: number;
  createdAt: Date;
  /** Importe efectivo: ya descuenta devoluciones y anulaciones (HU-35). */
  total: DecimalLike;
  /** Lo devuelto o anulado; `total + Σ ajustes` es el importe original. */
  adjustments: { total: DecimalLike }[];
}

export interface CreditPaymentRow {
  id: string;
  saleId: string | null;
  amount: DecimalLike;
  paymentDate: Date;
  notes: string | null;
  operationId: string | null;
  sale: { number: number } | null;
  /** Cuándo se registró la operación; los abonos anteriores a HU-19 no tienen. */
  operation: { createdAt: Date } | null;
}

/** Todo lo que se necesita para calcular la cuenta de un cliente. */
export interface CreditLedger {
  sales: CreditSaleRow[];
  payments: CreditPaymentRow[];
}

/** Operación recién guardada (o una anterior, si se reintentó la misma). */
export interface PaymentOperationRow {
  id: string;
  createdAt: Date;
  paymentDate: Date;
  totalAmount: DecimalLike;
  notes: string | null;
  payments: { saleId: string | null; amount: DecimalLike; sale: { number: number } | null }[];
}

/** Lo que el service le pide al repositorio guardar. */
export interface PaymentPlan {
  customerId: string;
  idempotencyKey: string;
  /** Huella de lo pedido: la misma llave con otros datos se rechaza. */
  fingerprint: string;
  amount: bigint;
  paymentDate: Date;
  notes: string | null;
  userId: string;
}

/** Resultado de intentar registrar el abono dentro de la transacción. */
export type RecordPaymentOutcome =
  | { ok: true; created: boolean; operation: PaymentOperationRow }
  | { ok: false; reason: 'CUSTOMER_NOT_FOUND' | 'KEY_REUSED' }
  | { ok: false; reason: 'REJECTED'; rejection: PaymentRejection };

/** Decisión que el service ejecuta con el estado real, ya con el cliente bloqueado. */
export type DecidePayment = (ledger: CreditLedger) => PaymentDecision;

export type FiadoStatusKind = 'PENDING' | 'PARTIAL' | 'SETTLED';

export interface FiadoDto {
  saleId: string;
  number: number;
  /** Fecha y hora de la venta (ISO 8601). */
  createdAt: string;
  originalAmount: string;
  effectiveAmount: string;
  paidAmount: string;
  pendingAmount: string;
  status: FiadoStatusKind;
}

export interface CreditSummaryDto {
  customer: CreditCustomerRef;
  /** Deuda actual (nunca negativa). */
  balance: string;
  totalCredited: string;
  totalPaid: string;
  /** Abonos anteriores a HU-19 que no están ligados a ninguna venta. */
  unassignedPaid: string;
  /** `true` si el cliente tiene fiados y ya no debe nada. */
  settled: boolean;
  /** `true` si el cliente tiene al menos una venta a crédito. */
  hasCredit: boolean;
  /** Fiados vigentes, del más antiguo al más reciente (con saldo y saldados). */
  fiados: FiadoDto[];
}

export interface PaymentAllocationDto {
  saleId: string | null;
  saleNumber: number | null;
  amount: string;
}

export interface PaymentDto {
  id: string;
  /** `OPERATION`: registrado con HU-19. `LEGACY`: abono anterior, sin operación. */
  kind: 'OPERATION' | 'LEGACY';
  /** Día del pago (`YYYY-MM-DD`, hora del negocio). */
  paymentDate: string;
  /** Cuándo se registró (ISO 8601). */
  createdAt: string;
  amount: string;
  notes: string | null;
  allocations: PaymentAllocationDto[];
}

/** Una página del historial de abonos (la pantalla pide de 4 en 4: es una lista dentro de una ventana). */
export interface PaymentsPageDto {
  /** Los abonos de esta página, del más reciente al más antiguo. */
  items: PaymentDto[];
  page: number;
  pageSize: number;
  /** Cuántos abonos tiene el cliente en total (cada operación cuenta una vez). */
  total: number;
}

export interface RegisterPaymentResultDto {
  payment: PaymentDto;
  credit: CreditSummaryDto;
  /** `true` si la llave ya estaba usada con los mismos datos: no se cobró de nuevo. */
  replayed: boolean;
}
