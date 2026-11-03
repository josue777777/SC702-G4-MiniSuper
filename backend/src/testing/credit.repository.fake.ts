import { randomUUID } from 'node:crypto';
import type {
  CreditCustomerRef,
  CreditLedger,
  CreditPaymentRow,
  CreditSaleRow,
  DecidePayment,
  PaymentOperationRow,
  PaymentPlan,
  RecordPaymentOutcome,
} from '../types/credit.js';
import { formatCents } from '../utils/money.js';
import { TEST_BUSINESS_ID } from './fake-session.js';

export const CREDIT_CUSTOMER_ID = '0c1c1c1c-0000-4000-8000-000000000001';
export const CREDIT_OTHER_CUSTOMER_ID = '0c1c1c1c-0000-4000-8000-000000000002';
export const CREDIT_FOREIGN_CUSTOMER_ID = '0c1c1c1c-0000-4000-8000-0000000000ff';

/** Importe como lo entrega Prisma (`Decimal`): solo importa `toFixed`. */
const decimal = (value: string) => ({ toFixed: (digits: number) => Number(value).toFixed(digits) });

/** Venta a crédito; `returned` es lo ya devuelto (el total efectivo ya lo descuenta). */
export function creditSale(
  id: string,
  number: number,
  at: string,
  effective: string,
  returned = '0',
): CreditSaleRow {
  return {
    id,
    number,
    createdAt: new Date(at),
    total: decimal(effective),
    adjustments: Number(returned) === 0 ? [] : [{ total: decimal(returned) }],
  };
}

/** Abono anterior a HU-19: sin venta ni operación. */
export function legacyPayment(amount: string, at = '2026-10-01T18:00:00Z'): CreditPaymentRow {
  return {
    id: randomUUID(),
    saleId: null,
    amount: decimal(amount),
    paymentDate: new Date(at),
    notes: null,
    operationId: null,
    sale: null,
    operation: null,
  };
}

interface StoredOperation {
  key: string;
  customerId: string;
  fingerprint: string;
  row: PaymentOperationRow;
}

/**
 * Doble del `CreditRepository`: guarda en memoria y, como el real, calcula la
 * decisión sobre el estado ACTUAL al guardar (no sobre lo que la pantalla creía).
 */
export class FakeCreditRepository {
  customers = new Map<string, CreditCustomerRef>();
  ledgers = new Map<string, CreditLedger>();
  operations: StoredOperation[] = [];
  recordCalls = 0;

  constructor(readonly businessId: string = TEST_BUSINESS_ID) {
    this.addCustomer(CREDIT_CUSTOMER_ID, 'Doña Marta');
    this.addCustomer(CREDIT_OTHER_CUSTOMER_ID, 'Don Luis');
  }

  addCustomer(id: string, name: string): void {
    this.customers.set(id, { id, name, phone: null, isActive: true });
    this.ledgers.set(id, { sales: [], payments: [] });
  }

  ledgerOf(customerId: string): CreditLedger {
    const ledger = this.ledgers.get(customerId);

    if (ledger === undefined) {
      throw new Error('cliente sin libro');
    }

    return ledger;
  }

  findCustomer(id: string) {
    return Promise.resolve(this.customers.get(id) ?? null);
  }

  loadLedger(customerId: string) {
    return Promise.resolve(this.ledgerOf(customerId));
  }

  listPayments(customerId: string) {
    return Promise.resolve(this.ledgerOf(customerId).payments);
  }

  recordPayment(plan: PaymentPlan, decide: DecidePayment): Promise<RecordPaymentOutcome> {
    this.recordCalls += 1;

    if (!this.customers.has(plan.customerId)) {
      return Promise.resolve({ ok: false, reason: 'CUSTOMER_NOT_FOUND' });
    }

    const existing = this.operations.find((operation) => operation.key === plan.idempotencyKey);

    if (existing !== undefined) {
      return Promise.resolve(
        existing.customerId === plan.customerId && existing.fingerprint === plan.fingerprint
          ? { ok: true, created: false, operation: existing.row }
          : { ok: false, reason: 'KEY_REUSED' },
      );
    }

    const ledger = this.ledgerOf(plan.customerId);
    const decision = decide(ledger);

    if (!decision.ok) {
      const { ok: _ok, ...rejection } = decision;

      return Promise.resolve({ ok: false, reason: 'REJECTED', rejection });
    }

    const operationId = randomUUID();
    const operation: PaymentOperationRow = {
      id: operationId,
      createdAt: new Date(),
      paymentDate: plan.paymentDate,
      totalAmount: decimal(formatCents(plan.amount)),
      notes: plan.notes,
      payments: decision.allocations.map((allocation) => ({
        saleId: allocation.saleId,
        amount: decimal(formatCents(allocation.amount)),
        sale: { number: allocation.number },
      })),
    };

    for (const allocation of decision.allocations) {
      ledger.payments.push({
        id: randomUUID(),
        saleId: allocation.saleId,
        amount: decimal(formatCents(allocation.amount)),
        paymentDate: plan.paymentDate,
        notes: plan.notes,
        operationId,
        sale: { number: allocation.number },
        operation: { createdAt: operation.createdAt },
      });
    }

    this.operations.push({
      key: plan.idempotencyKey,
      customerId: plan.customerId,
      fingerprint: plan.fingerprint,
      row: operation,
    });

    return Promise.resolve({ ok: true, created: true, operation });
  }
}
