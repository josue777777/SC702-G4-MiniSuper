import { prisma } from '../config/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import { formatCents } from '../utils/money.js';
import type {
  CreditCustomerRef,
  CreditLedger,
  DecidePayment,
  PaymentOperationRow,
  PaymentPlan,
  RecordPaymentOutcome,
} from '../types/credit.js';

/** Cliente de Prisma o de una transacción: las mismas lecturas sirven para ambos. */
type Db = Prisma.TransactionClient;

const operationSelection = {
  id: true,
  customerId: true,
  fingerprint: true,
  createdAt: true,
  paymentDate: true,
  totalAmount: true,
  notes: true,
  payments: {
    orderBy: [{ sale: { createdAt: 'asc' } }, { sale: { number: 'asc' } }, { id: 'asc' }],
    select: { saleId: true, amount: true, sale: { select: { number: true } } },
  },
} as const satisfies Prisma.CreditPaymentOperationSelect;

/**
 * Capa de acceso a datos de las cuentas por cobrar y los abonos (HU-19).
 *
 * Atada a UN negocio (multi-negocio, ADR 0002): el cliente, sus ventas y sus
 * abonos se piden siempre con el negocio de la sesión. El saldo NO se guarda;
 * aquí solo se leen ventas y abonos para que el service lo derive.
 *
 * Sin miembros privados a propósito: el service se prueba con un doble.
 */
export class CreditRepository {
  constructor(readonly businessId: string) {}

  async findCustomer(id: string): Promise<CreditCustomerRef | null> {
    return prisma.customer.findFirst({
      where: { id, businessId: this.businessId },
      select: { id: true, name: true, phone: true, isActive: true },
    });
  }

  /** Ventas a crédito y abonos del cliente, tal como están ahora. */
  async loadLedger(customerId: string): Promise<CreditLedger> {
    return this.readLedger(prisma, customerId);
  }

  /** Abonos del cliente, del más reciente al más antiguo. */
  async listPayments(customerId: string): Promise<CreditLedger['payments']> {
    const { payments } = await this.readLedger(prisma, customerId, false);

    return payments;
  }

  /**
   * Registra un abono en UNA transacción, con el estado real del cliente.
   *
   * 1. Bloquea la fila del cliente: dos abonos del mismo cliente se hacen uno a la
   *    vez, así nunca se confirman dos que juntos superen la deuda.
   * 2. Si la llave ya existe: con los mismos datos devuelve la operación guardada
   *    (no cobra de nuevo); con otros datos, la rechaza.
   * 3. Bloquea sus ventas a crédito (en orden fijo) para que una devolución o
   *    anulación (HU-35) no cambie un importe a mitad del cálculo.
   * 4. Lee las ventas y abonos YA CON LOS BLOQUEOS y deja que `decide` valide y
   *    reparta (FIFO). Si no es válido, no escribe nada.
   * 5. Guarda la operación y todas sus filas de reparto, o nada.
   */
  async recordPayment(plan: PaymentPlan, decide: DecidePayment): Promise<RecordPaymentOutcome> {
    return prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Customer"
        WHERE id = ${plan.customerId}::uuid AND "businessId" = ${this.businessId}::uuid
        FOR UPDATE`;

      if (locked.length === 0) {
        return { ok: false, reason: 'CUSTOMER_NOT_FOUND' };
      }

      const existing = await tx.creditPaymentOperation.findUnique({
        where: {
          businessId_idempotencyKey: {
            businessId: this.businessId,
            idempotencyKey: plan.idempotencyKey,
          },
        },
        select: operationSelection,
      });

      if (existing !== null) {
        return existing.customerId === plan.customerId && existing.fingerprint === plan.fingerprint
          ? { ok: true, created: false, operation: existing }
          : { ok: false, reason: 'KEY_REUSED' };
      }

      await tx.$queryRaw`
        SELECT id FROM "Sale"
        WHERE "customerId" = ${plan.customerId}::uuid
          AND "businessId" = ${this.businessId}::uuid
          AND "paymentMethod" = 'CREDIT'
        ORDER BY id
        FOR UPDATE`;

      const decision = decide(await this.readLedger(tx, plan.customerId));

      if (!decision.ok) {
        const { ok: _ok, ...rejection } = decision;

        return { ok: false, reason: 'REJECTED', rejection };
      }

      const operation: PaymentOperationRow = await tx.creditPaymentOperation.create({
        data: {
          businessId: this.businessId,
          customerId: plan.customerId,
          idempotencyKey: plan.idempotencyKey,
          fingerprint: plan.fingerprint,
          totalAmount: formatCents(plan.amount),
          paymentDate: plan.paymentDate,
          notes: plan.notes,
          createdById: plan.userId,
          payments: {
            create: decision.allocations.map((allocation) => ({
              customerId: plan.customerId,
              saleId: allocation.saleId,
              amount: formatCents(allocation.amount),
              paymentDate: plan.paymentDate,
              notes: plan.notes,
            })),
          },
        },
        select: operationSelection,
      });

      return { ok: true, created: true, operation };
    });
  }

  /** Lectura de ventas a crédito y abonos; con `includeSales = false` solo los abonos. */
  private async readLedger(db: Db, customerId: string, includeSales = true): Promise<CreditLedger> {
    const [sales, payments] = await Promise.all([
      includeSales
        ? db.sale.findMany({
            where: { businessId: this.businessId, customerId, paymentMethod: 'CREDIT' },
            orderBy: [{ createdAt: 'asc' }, { number: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              number: true,
              createdAt: true,
              total: true,
              adjustments: { select: { total: true } },
            },
          })
        : Promise.resolve([]),
      db.creditPayment.findMany({
        where: { customerId, customer: { businessId: this.businessId } },
        orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          saleId: true,
          amount: true,
          paymentDate: true,
          notes: true,
          operationId: true,
          sale: { select: { number: true } },
          operation: { select: { createdAt: true } },
        },
      }),
    ]);

    return { sales, payments };
  }
}
