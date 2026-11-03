import { todayInBusinessZone } from '../utils/dates.js';

/**
 * Cuentas por cobrar de un cliente (HU-18, HU-19, HU-29, HU-30): reglas PURAS,
 * sin base de datos, en céntimos exactos (`bigint`).
 *
 * El saldo NUNCA se guarda: sale de las ventas a crédito vigentes y de los abonos.
 *
 *   saldo = Σ importe efectivo de sus ventas CREDIT − Σ todos sus abonos
 *
 * «Efectivo» es `Sale.total`, que ya descuenta devoluciones y anulaciones (HU-35).
 *
 * Cada abono nuevo se reparte entre fiados concretos (FIFO) y queda ligado a
 * ellos con `CreditPayment.saleId`; así cada fiado sabe cuánto se le ha pagado.
 * Los abonos anteriores a HU-19 pueden no tener venta (`saleId` nulo): cuentan
 * en el saldo del cliente, pero NO se atribuyen a ningún fiado (no se inventa
 * una asignación histórica) y se informan aparte como «sin venta asignada».
 */

export interface CreditSale {
  id: string;
  number: number;
  createdAt: Date;
  /** Importe efectivo: lo vendido menos lo devuelto o anulado. */
  effective: bigint;
  /** Importe original de la venta, antes de devoluciones. */
  original: bigint;
}

export interface CreditPaymentEntry {
  /** Venta a la que se aplicó; `null` en un abono anterior a HU-19. */
  saleId: string | null;
  amount: bigint;
}

export type FiadoStatus = 'PENDING' | 'PARTIAL' | 'SETTLED';

export interface Fiado {
  saleId: string;
  number: number;
  createdAt: Date;
  original: bigint;
  effective: bigint;
  /** Abonado a ESTE fiado (solo abonos ligados a su venta). */
  paid: bigint;
  pending: bigint;
  status: FiadoStatus;
}

export interface CreditPosition {
  /** Fiados vigentes (efectivo > 0), del más antiguo al más reciente. */
  fiados: Fiado[];
  /** Σ importe efectivo de todas sus ventas a crédito. */
  credited: bigint;
  /** Σ todos los abonos, con o sin venta. */
  paid: bigint;
  /** Abonos anteriores a HU-19 que no tienen venta asignada. */
  unassignedPaid: bigint;
  /** `credited − paid`; negativo solo si hay datos anteriores inconsistentes. */
  balance: bigint;
}

/** Orden único de las ventas: fecha, número y, como último desempate, el id. */
export function compareSales(
  a: { createdAt: Date; number: number; id: string },
  b: { createdAt: Date; number: number; id: string },
): number {
  return (
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.number - b.number ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export function creditPosition(
  sales: CreditSale[],
  payments: CreditPaymentEntry[],
): CreditPosition {
  const paidBySale = new Map<string, bigint>();
  let paid = 0n;
  let unassignedPaid = 0n;

  for (const payment of payments) {
    paid += payment.amount;

    if (payment.saleId === null) {
      unassignedPaid += payment.amount;
    } else {
      paidBySale.set(payment.saleId, (paidBySale.get(payment.saleId) ?? 0n) + payment.amount);
    }
  }

  const fiados: Fiado[] = [...sales]
    .sort(compareSales)
    .filter((sale) => sale.effective > 0n)
    .map((sale) => {
      const saleAssigned = paidBySale.get(sale.id) ?? 0n;
      const pending = sale.effective > saleAssigned ? sale.effective - saleAssigned : 0n;

      return {
        saleId: sale.id,
        number: sale.number,
        createdAt: sale.createdAt,
        original: sale.original,
        effective: sale.effective,
        paid: saleAssigned,
        pending,
        status: pending === 0n ? 'SETTLED' : saleAssigned === 0n ? 'PENDING' : 'PARTIAL',
      };
    });
  const credited = sales.reduce((sum, sale) => sum + sale.effective, 0n);

  return { fiados, credited, paid, unassignedPaid, balance: credited - paid };
}

/** Deuda real del cliente: nunca negativa (un saldo a favor no existe en el sistema). */
export function debtOf(position: CreditPosition): bigint {
  return position.balance > 0n ? position.balance : 0n;
}

/**
 * Lo máximo que se puede abonar: el saldo, sin pasar de lo que los fiados
 * vigentes realmente deben (protege de datos anteriores inconsistentes).
 */
export function payableOf(position: CreditPosition): bigint {
  const pendingTotal = position.fiados.reduce((sum, fiado) => sum + fiado.pending, 0n);
  const debt = debtOf(position);

  return debt < pendingTotal ? debt : pendingTotal;
}

export interface PaymentRequest {
  amount: bigint;
  /** Día del pago (`YYYY-MM-DD`, hora del negocio). */
  paymentDate: string;
  /** Fiado elegido; `null` = repartir entre los más antiguos primero. */
  saleId: string | null;
}

export interface Allocation {
  saleId: string;
  number: number;
  amount: bigint;
}

export type PaymentRejection =
  | { reason: 'NO_DEBT' }
  | { reason: 'EXCEEDS_DEBT'; payable: bigint }
  | { reason: 'SALE_NOT_FOUND' }
  | { reason: 'SALE_SETTLED'; number: number }
  | { reason: 'EXCEEDS_SALE'; number: number; pending: bigint }
  | { reason: 'DATE_BEFORE_SALE'; number: number; saleDate: string };

export type PaymentDecision =
  { ok: true; allocations: Allocation[] } | ({ ok: false } & PaymentRejection);

/**
 * Decide si un abono es válido y cómo se reparte. Se ejecuta DENTRO de la
 * transacción, con el cliente y sus ventas bloqueados, sobre el estado real.
 *
 * Reparto, determinista: sin fiado elegido, FIFO (fecha de venta, número, id)
 * sobre los fiados con saldo; con fiado elegido, solo a ese. Nunca se acepta
 * más de lo adeudado: no existen saldos a favor.
 */
export function decidePayment(position: CreditPosition, request: PaymentRequest): PaymentDecision {
  const payable = payableOf(position);

  if (payable <= 0n) {
    return { ok: false, reason: 'NO_DEBT' };
  }

  let targets: Fiado[];

  if (request.saleId === null) {
    if (request.amount > payable) {
      return { ok: false, reason: 'EXCEEDS_DEBT', payable };
    }

    targets = position.fiados.filter((fiado) => fiado.pending > 0n);
  } else {
    const chosen = position.fiados.find((fiado) => fiado.saleId === request.saleId);

    if (chosen === undefined) {
      return { ok: false, reason: 'SALE_NOT_FOUND' };
    }

    if (chosen.pending === 0n) {
      return { ok: false, reason: 'SALE_SETTLED', number: chosen.number };
    }

    if (request.amount > chosen.pending) {
      return { ok: false, reason: 'EXCEEDS_SALE', number: chosen.number, pending: chosen.pending };
    }

    if (request.amount > payable) {
      return { ok: false, reason: 'EXCEEDS_DEBT', payable };
    }

    targets = [chosen];
  }

  const allocations: Allocation[] = [];
  let remaining = request.amount;

  for (const fiado of targets) {
    if (remaining === 0n) {
      break;
    }

    const part = remaining < fiado.pending ? remaining : fiado.pending;

    allocations.push({ saleId: fiado.saleId, number: fiado.number, amount: part });
    remaining -= part;
  }

  // Un pago no puede fecharse antes de la venta que salda.
  for (const allocation of allocations) {
    const fiado = targets.find((entry) => entry.saleId === allocation.saleId);
    const saleDate = fiado === undefined ? '' : todayInBusinessZone(fiado.createdAt);

    if (saleDate !== '' && request.paymentDate < saleDate) {
      return { ok: false, reason: 'DATE_BEFORE_SALE', number: allocation.number, saleDate };
    }
  }

  return { ok: true, allocations };
}
