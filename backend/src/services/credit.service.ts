import { createHash } from 'node:crypto';
import type { CreditRepository } from '../repositories/credit.repository.js';
import type {
  CreditCustomerRef,
  CreditLedger,
  CreditSummaryDto,
  PaymentDto,
  PaymentOperationRow,
  RegisterPaymentResultDto,
} from '../types/credit.js';
import { businessDayRange, todayInBusinessZone } from '../utils/dates.js';
import { HttpError } from '../utils/http-error.js';
import { formatCents, formatColones, toCents } from '../utils/money.js';
import type { RegisterPaymentInput } from '../validators/credit.validator.js';
import {
  creditPosition,
  debtOf,
  decidePayment,
  type CreditPosition,
  type PaymentRejection,
} from './credit.js';

const cents = (value: { toFixed(digits: number): string }) => toCents(value.toFixed(2));

/** Estado de la cuenta de un cliente a partir de sus ventas a crédito y abonos. */
export function positionOf(ledger: CreditLedger): CreditPosition {
  return creditPosition(
    ledger.sales.map((sale) => {
      const effective = cents(sale.total);

      return {
        id: sale.id,
        number: sale.number,
        createdAt: sale.createdAt,
        effective,
        // Lo devuelto o anulado ya salió del total: el original es el total más los ajustes.
        original: effective + sale.adjustments.reduce((sum, item) => sum + cents(item.total), 0n),
      };
    }),
    ledger.payments.map((payment) => ({ saleId: payment.saleId, amount: cents(payment.amount) })),
  );
}

function toSummary(customer: CreditCustomerRef, ledger: CreditLedger): CreditSummaryDto {
  const position = positionOf(ledger);
  const debt = debtOf(position);

  return {
    customer,
    balance: formatCents(debt),
    totalCredited: formatCents(position.credited),
    totalPaid: formatCents(position.paid),
    unassignedPaid: formatCents(position.unassignedPaid),
    hasCredit: ledger.sales.length > 0,
    settled: ledger.sales.length > 0 && debt === 0n,
    fiados: position.fiados.map((fiado) => ({
      saleId: fiado.saleId,
      number: fiado.number,
      createdAt: fiado.createdAt.toISOString(),
      originalAmount: formatCents(fiado.original),
      effectiveAmount: formatCents(fiado.effective),
      paidAmount: formatCents(fiado.paid),
      pendingAmount: formatCents(fiado.pending),
      status: fiado.status,
    })),
  };
}

function toOperationDto(operation: PaymentOperationRow): PaymentDto {
  return {
    id: operation.id,
    kind: 'OPERATION',
    paymentDate: todayInBusinessZone(operation.paymentDate),
    createdAt: operation.createdAt.toISOString(),
    amount: formatCents(cents(operation.totalAmount)),
    notes: operation.notes,
    allocations: operation.payments.map((payment) => ({
      saleId: payment.saleId,
      saleNumber: payment.sale?.number ?? null,
      amount: formatCents(cents(payment.amount)),
    })),
  };
}

/**
 * Historial de abonos: cada operación de HU-19 es UNA línea con sus repartos; los
 * abonos anteriores (sin operación) aparecen uno por uno, marcados como anteriores.
 */
function toPaymentDtos(payments: CreditLedger['payments']): PaymentDto[] {
  const operations = new Map<string, PaymentDto>();
  const result: PaymentDto[] = [];

  for (const payment of payments) {
    const allocation = {
      saleId: payment.saleId,
      saleNumber: payment.sale?.number ?? null,
      amount: formatCents(cents(payment.amount)),
    };

    if (payment.operationId === null) {
      result.push({
        id: payment.id,
        kind: 'LEGACY',
        paymentDate: todayInBusinessZone(payment.paymentDate),
        createdAt: payment.paymentDate.toISOString(),
        amount: allocation.amount,
        notes: payment.notes,
        allocations: payment.saleId === null ? [] : [allocation],
      });
      continue;
    }

    const existing = operations.get(payment.operationId);

    if (existing === undefined) {
      const dto: PaymentDto = {
        id: payment.operationId,
        kind: 'OPERATION',
        paymentDate: todayInBusinessZone(payment.paymentDate),
        createdAt: (payment.operation?.createdAt ?? payment.paymentDate).toISOString(),
        amount: allocation.amount,
        notes: payment.notes,
        allocations: [allocation],
      };

      operations.set(payment.operationId, dto);
      result.push(dto);
    } else {
      existing.amount = formatCents(toCents(existing.amount) + toCents(allocation.amount));
      existing.allocations.push(allocation);
    }
  }

  for (const dto of result) {
    dto.allocations.sort((a, b) => (a.saleNumber ?? 0) - (b.saleNumber ?? 0));
  }

  return result.sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1,
  );
}

/** Por qué se rechazó un abono, dicho para quien lo registra. */
function rejectionError(rejection: PaymentRejection, requested: bigint): HttpError {
  switch (rejection.reason) {
    case 'NO_DEBT':
      return HttpError.conflict('Este cliente no tiene fiados pendientes.', { reason: 'NO_DEBT' });
    case 'EXCEEDS_DEBT':
      return HttpError.conflict(
        `El pago de ${formatColones(requested)} supera la deuda pendiente (${formatColones(rejection.payable)}) por ${formatColones(requested - rejection.payable)}. Si el saldo cambió, recargue la ficha del cliente; no se registró ningún abono.`,
        {
          reason: 'EXCEEDS_DEBT',
          balance: formatCents(rejection.payable),
          excess: formatCents(requested - rejection.payable),
        },
      );
    case 'SALE_NOT_FOUND':
      return HttpError.notFound('El fiado indicado no existe para este cliente.');
    case 'SALE_SETTLED':
      return HttpError.conflict(`El fiado #${rejection.number} ya está saldado.`, {
        reason: 'SALE_SETTLED',
      });
    case 'EXCEEDS_SALE':
      return HttpError.conflict(
        `El pago supera lo pendiente del fiado #${rejection.number} (${formatColones(rejection.pending)}) por ${formatColones(requested - rejection.pending)}.`,
        {
          reason: 'EXCEEDS_SALE',
          pending: formatCents(rejection.pending),
          excess: formatCents(requested - rejection.pending),
        },
      );
    case 'DATE_BEFORE_SALE':
      return HttpError.badRequest(
        `La fecha del pago no puede ser anterior a la del fiado #${rejection.number} (${rejection.saleDate}).`,
        { reason: 'DATE_BEFORE_SALE' },
      );
  }
}

/**
 * Cuentas por cobrar y abonos de los clientes (HU-19). No conoce HTTP ni Prisma:
 * calcula la deuda con las reglas de `credit.ts` y deja la escritura atómica al
 * repositorio. Atado al negocio de la sesión.
 */
export class CreditService {
  /** `today` entrega el día de hoy del negocio; se recibe para fijarlo en las pruebas. */
  constructor(
    private readonly repository: CreditRepository,
    private readonly today: () => string = () => todayInBusinessZone(),
  ) {}

  /** Deuda actual del cliente con sus fiados (HU-19: buscar al cliente y ver su deuda). */
  async getCredit(customerId: string): Promise<CreditSummaryDto> {
    const customer = await this.requireCustomer(customerId);

    return toSummary(customer, await this.repository.loadLedger(customerId));
  }

  /** Historial de abonos del cliente, del más reciente al más antiguo. */
  async listPayments(customerId: string): Promise<PaymentDto[]> {
    await this.requireCustomer(customerId);

    return toPaymentDtos(await this.repository.listPayments(customerId));
  }

  /**
   * Registra un abono (HU-19). La validación se repite aquí aunque la pantalla ya
   * la haga, y la deuda se vuelve a calcular DENTRO de la transacción: lo que
   * decide es el estado real al momento de guardar, no lo que la pantalla creía.
   */
  async registerPayment(
    customerId: string,
    input: RegisterPaymentInput,
    userId: string,
  ): Promise<RegisterPaymentResultDto> {
    const day = input.paymentDate ?? this.today();

    if (day > this.today()) {
      throw HttpError.badRequest('La fecha del pago no puede ser futura.');
    }

    if (day < '2000-01-01') {
      throw HttpError.badRequest('La fecha del pago no es válida.');
    }

    const customer = await this.requireCustomer(customerId);
    const amount = toCents(input.amount);
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([customerId, formatCents(amount), day, input.notes, input.saleId]))
      .digest('hex');

    const outcome = await this.repository.recordPayment(
      {
        customerId,
        idempotencyKey: input.idempotencyKey,
        fingerprint,
        amount,
        paymentDate: businessDayRange(day, day).start,
        notes: input.notes,
        userId,
      },
      (ledger) =>
        decidePayment(positionOf(ledger), { amount, paymentDate: day, saleId: input.saleId }),
    );

    if (!outcome.ok) {
      switch (outcome.reason) {
        case 'CUSTOMER_NOT_FOUND':
          throw HttpError.notFound('El cliente no existe.');
        case 'KEY_REUSED':
          throw HttpError.conflict(
            'Esta confirmación ya se usó con otros datos. Recargue la ficha del cliente e intente de nuevo.',
            { reason: 'KEY_REUSED' },
          );
        case 'REJECTED':
          throw rejectionError(outcome.rejection, amount);
      }
    }

    return {
      payment: toOperationDto(outcome.operation),
      credit: toSummary(customer, await this.repository.loadLedger(customerId)),
      replayed: !outcome.created,
    };
  }

  private async requireCustomer(customerId: string): Promise<CreditCustomerRef> {
    const customer = await this.repository.findCustomer(customerId);

    if (customer === null) {
      throw HttpError.notFound('El cliente no existe.');
    }

    return customer;
  }
}
