import { describe, expect, it } from 'vitest';
import {
  creditPosition,
  debtOf,
  decidePayment,
  payableOf,
  type CreditPaymentEntry,
  type CreditSale,
  type PaymentRequest,
} from './credit.js';

/**
 * Cuentas por cobrar (HU-19): reglas puras. Los importes están en céntimos:
 * ₡6 000 = 600_000n.
 */

const c = (colones: number) => BigInt(colones) * 100n;

function sale(
  id: string,
  number: number,
  at: string,
  effective: number,
  original = effective,
): CreditSale {
  return { id, number, createdAt: new Date(at), effective: c(effective), original: c(original) };
}

const pay = (saleId: string | null, colones: number): CreditPaymentEntry => ({
  saleId,
  amount: c(colones),
});

const request = (amount: number, over: Partial<PaymentRequest> = {}): PaymentRequest => ({
  amount: c(amount),
  paymentDate: '2026-11-03',
  saleId: null,
  ...over,
});

/** Venta #12 debe ₡6 000 y la #15 ₡3 000: el ejemplo del encargo. */
const TWO_SALES = [
  sale('s15', 15, '2026-10-05T18:00:00Z', 3000),
  sale('s12', 12, '2026-10-01T18:00:00Z', 6000),
];

describe('creditPosition', () => {
  it('sin ventas ni abonos no hay deuda', () => {
    const position = creditPosition([], []);

    expect(position).toMatchObject({ credited: 0n, paid: 0n, balance: 0n, unassignedPaid: 0n });
    expect(position.fiados).toEqual([]);
  });

  it('saldo = ventas efectivas − todos los abonos, y cada fiado lleva solo lo abonado a su venta', () => {
    const position = creditPosition(TWO_SALES, [pay('s12', 2000), pay('s12', 1000)]);

    expect(position.balance).toBe(c(6000));
    // Del más antiguo al más reciente, sin importar el orden de entrada.
    expect(position.fiados.map((f) => [f.number, f.paid, f.pending, f.status])).toEqual([
      [12, c(3000), c(3000), 'PARTIAL'],
      [15, 0n, c(3000), 'PENDING'],
    ]);
  });

  it('un fiado cubierto está saldado y una venta anulada (efectivo 0) no es un fiado', () => {
    const position = creditPosition(
      [...TWO_SALES, sale('v', 20, '2026-10-06T18:00:00Z', 0, 5000)],
      [pay('s12', 6000)],
    );

    expect(position.fiados.map((f) => [f.number, f.status])).toEqual([
      [12, 'SETTLED'],
      [15, 'PENDING'],
    ]);
    expect(position.balance).toBe(c(3000));
  });

  it('un abono anterior a HU-19 (sin venta) baja el saldo pero no se atribuye a ningún fiado', () => {
    const position = creditPosition(TWO_SALES, [pay(null, 2000)]);

    expect(position.unassignedPaid).toBe(c(2000));
    expect(position.balance).toBe(c(7000));
    expect(position.fiados.map((f) => f.paid)).toEqual([0n, 0n]);
  });

  it('desempata ventas de la misma fecha por número y, al final, por id', () => {
    const same = '2026-10-01T18:00:00Z';
    const position = creditPosition(
      [sale('b', 2, same, 100), sale('a', 2, same, 100), sale('z', 1, same, 100)],
      [],
    );

    expect(position.fiados.map((f) => f.saleId)).toEqual(['z', 'a', 'b']);
  });

  it('debtOf nunca es negativa y payableOf no pasa de lo que los fiados deben', () => {
    const over = creditPosition([sale('s', 1, '2026-10-01T18:00:00Z', 1000)], [pay(null, 1500)]);

    expect(over.balance).toBe(-c(500));
    expect(debtOf(over)).toBe(0n);
    expect(payableOf(over)).toBe(0n);
  });
});

describe('decidePayment: caso A, pago parcial', () => {
  it('abona ₡4 000 de ₡10 000 al fiado más antiguo', () => {
    const position = creditPosition([sale('s1', 1, '2026-10-01T18:00:00Z', 10000)], []);
    const decision = decidePayment(position, request(4000));

    expect(decision).toEqual({
      ok: true,
      allocations: [{ saleId: 's1', number: 1, amount: c(4000) }],
    });
  });
});

describe('decidePayment: caso B, pago exacto', () => {
  it('paga exactamente la deuda y la reparte en todos los fiados', () => {
    const position = creditPosition(TWO_SALES, []);
    const decision = decidePayment(position, request(9000));

    expect(decision).toEqual({
      ok: true,
      allocations: [
        { saleId: 's12', number: 12, amount: c(6000) },
        { saleId: 's15', number: 15, amount: c(3000) },
      ],
    });
  });
});

describe('decidePayment: caso C, pago superior a la deuda', () => {
  it('rechaza ₡12 000 sobre una deuda de ₡10 000 e informa lo que sí se puede pagar', () => {
    const position = creditPosition([sale('s1', 1, '2026-10-01T18:00:00Z', 10000)], []);

    expect(decidePayment(position, request(12000))).toEqual({
      ok: false,
      reason: 'EXCEEDS_DEBT',
      payable: c(10000),
    });
  });

  it('un centavo de más ya es un exceso', () => {
    const position = creditPosition([sale('s1', 1, '2026-10-01T18:00:00Z', 10000)], []);

    expect(decidePayment(position, { ...request(10000), amount: c(10000) + 1n })).toMatchObject({
      ok: false,
      reason: 'EXCEEDS_DEBT',
    });
  });
});

describe('decidePayment: caso D, cliente sin deuda', () => {
  it('rechaza todo abono si no hay fiados pendientes', () => {
    expect(decidePayment(creditPosition([], []), request(100))).toEqual({
      ok: false,
      reason: 'NO_DEBT',
    });
    // Ya saldado: tampoco.
    const settled = creditPosition([sale('s1', 1, '2026-10-01T18:00:00Z', 500)], [pay('s1', 500)]);

    expect(decidePayment(settled, request(1))).toEqual({ ok: false, reason: 'NO_DEBT' });
  });
});

describe('FIFO', () => {
  it('₡7 000 con las ventas #12 (₡6 000) y #15 (₡3 000): salda la #12 y deja ₡2 000 en la #15', () => {
    const position = creditPosition(TWO_SALES, []);
    const decision = decidePayment(position, request(7000));

    expect(decision).toEqual({
      ok: true,
      allocations: [
        { saleId: 's12', number: 12, amount: c(6000) },
        { saleId: 's15', number: 15, amount: c(1000) },
      ],
    });
    // El saldo general pasa de ₡9 000 a ₡2 000.
    const after = creditPosition(TWO_SALES, [pay('s12', 6000), pay('s15', 1000)]);

    expect(after.balance).toBe(c(2000));
    expect(after.fiados.map((f) => [f.number, f.pending])).toEqual([
      [12, 0n],
      [15, c(2000)],
    ]);
  });

  it('un segundo abono continúa donde quedó el primero', () => {
    const position = creditPosition(TWO_SALES, [pay('s12', 4000)]);

    expect(decidePayment(position, request(3000))).toEqual({
      ok: true,
      allocations: [
        { saleId: 's12', number: 12, amount: c(2000) },
        { saleId: 's15', number: 15, amount: c(1000) },
      ],
    });
  });

  it('la suma de lo repartido es siempre el monto pagado', () => {
    const position = creditPosition(
      [
        sale('a', 1, '2026-10-01T18:00:00Z', 333),
        sale('b', 2, '2026-10-02T18:00:00Z', 777),
        sale('c', 3, '2026-10-03T18:00:00Z', 1234),
      ],
      [pay('a', 100)],
    );

    for (const amount of [1, 233, 234, 1011, 2000, 2011]) {
      const decision = decidePayment(position, request(amount));

      expect(decision.ok).toBe(true);

      if (decision.ok) {
        expect(decision.allocations.reduce((sum, item) => sum + item.amount, 0n)).toBe(c(amount));
      }
    }
  });

  it('con abonos anteriores sin venta, solo se puede pagar el saldo real', () => {
    // Los fiados deben ₡9 000 pero ya hay ₡2 000 sin venta: la deuda es ₡7 000.
    const position = creditPosition(TWO_SALES, [pay(null, 2000)]);

    expect(payableOf(position)).toBe(c(7000));
    expect(decidePayment(position, request(7001))).toMatchObject({
      ok: false,
      reason: 'EXCEEDS_DEBT',
    });
    expect(decidePayment(position, request(7000)).ok).toBe(true);
  });
});

describe('abono a un fiado específico', () => {
  const position = creditPosition(TWO_SALES, [pay('s12', 6000)]);

  it('se aplica solo a ese fiado', () => {
    expect(decidePayment(position, request(1000, { saleId: 's15' }))).toEqual({
      ok: true,
      allocations: [{ saleId: 's15', number: 15, amount: c(1000) }],
    });
  });

  it('rechaza un fiado ya saldado', () => {
    expect(decidePayment(position, request(1, { saleId: 's12' }))).toEqual({
      ok: false,
      reason: 'SALE_SETTLED',
      number: 12,
    });
  });

  it('rechaza más de lo pendiente de ese fiado aunque el cliente deba más en total', () => {
    const two = creditPosition(TWO_SALES, []);

    expect(decidePayment(two, request(3500, { saleId: 's15' }))).toEqual({
      ok: false,
      reason: 'EXCEEDS_SALE',
      number: 15,
      pending: c(3000),
    });
  });

  it('una venta que no es un fiado vigente del cliente (ajena o anulada) no existe', () => {
    expect(decidePayment(position, request(1, { saleId: 'otra-venta' }))).toEqual({
      ok: false,
      reason: 'SALE_NOT_FOUND',
    });

    const voided = creditPosition(
      [sale('v', 1, '2026-10-01T18:00:00Z', 0, 5000), ...TWO_SALES],
      [],
    );

    expect(decidePayment(voided, request(1, { saleId: 'v' }))).toMatchObject({
      reason: 'SALE_NOT_FOUND',
    });
  });
});

describe('fecha del pago', () => {
  it('no puede ser anterior a la venta que salda (hora de Costa Rica)', () => {
    // La venta #12 es del 1 de octubre en Costa Rica.
    const position = creditPosition(TWO_SALES, []);

    expect(decidePayment(position, request(100, { paymentDate: '2026-09-30' }))).toEqual({
      ok: false,
      reason: 'DATE_BEFORE_SALE',
      number: 12,
      saleDate: '2026-10-01',
    });
    expect(decidePayment(position, request(100, { paymentDate: '2026-10-01' })).ok).toBe(true);
  });

  it('solo mira las ventas que realmente se pagan', () => {
    // Pagar ₡1 000 de la #12 (1 oct) con fecha 2 oct no choca con la #15 (5 oct).
    const position = creditPosition(TWO_SALES, []);

    expect(decidePayment(position, request(1000, { paymentDate: '2026-10-02' })).ok).toBe(true);
    // Pero pagar ₡7 000 llega a la #15 y la fecha del 2 de octubre es anterior a ella.
    expect(decidePayment(position, request(7000, { paymentDate: '2026-10-02' }))).toMatchObject({
      ok: false,
      reason: 'DATE_BEFORE_SALE',
      number: 15,
    });
  });
});
