import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CREDIT_CUSTOMER_ID,
  FakeCreditRepository,
  creditSale,
  legacyPayment,
} from '../testing/credit.repository.fake.js';
import type { RegisterPaymentInput } from '../validators/credit.validator.js';
import { CreditService } from './credit.service.js';

/** Cuentas por cobrar y abonos (HU-19): reglas del service con un repositorio falso. */

const TODAY = '2026-11-03';
const USER = '0a000000-0000-4000-8000-000000000001';

function build() {
  const repository = new FakeCreditRepository();
  const service = new CreditService(repository as never, () => TODAY);

  // Venta #12 debe ₡6 000 y la #15 ₡3 000.
  repository
    .ledgerOf(CREDIT_CUSTOMER_ID)
    .sales.push(
      creditSale('s12', 12, '2026-10-01T18:00:00Z', '6000'),
      creditSale('s15', 15, '2026-10-05T18:00:00Z', '3000'),
    );

  return { repository, service };
}

function input(overrides: Partial<RegisterPaymentInput> = {}): RegisterPaymentInput {
  return {
    idempotencyKey: randomUUID(),
    amount: '1000.00',
    notes: null,
    saleId: null,
    ...overrides,
  };
}

const pay = (service: CreditService, overrides: Partial<RegisterPaymentInput> = {}) =>
  service.registerPayment(CREDIT_CUSTOMER_ID, input(overrides), USER);

describe('deuda del cliente (criterio 1)', () => {
  it('muestra la deuda total, lo abonado y cada fiado con su monto original, efectivo y pendiente', async () => {
    const { service, repository } = build();

    // La venta #15 era de ₡5 000 y se devolvieron ₡2 000.
    repository.ledgerOf(CREDIT_CUSTOMER_ID).sales[1] = creditSale(
      's15',
      15,
      '2026-10-05T18:00:00Z',
      '3000',
      '2000',
    );

    const credit = await service.getCredit(CREDIT_CUSTOMER_ID);

    expect(credit).toMatchObject({
      balance: '9000.00',
      totalCredited: '9000.00',
      totalPaid: '0.00',
      unassignedPaid: '0.00',
      hasCredit: true,
      settled: false,
      customer: { name: 'Doña Marta' },
    });
    expect(
      credit.fiados.map((f) => [
        f.number,
        f.originalAmount,
        f.effectiveAmount,
        f.pendingAmount,
        f.status,
      ]),
    ).toEqual([
      [12, '6000.00', '6000.00', '6000.00', 'PENDING'],
      [15, '5000.00', '3000.00', '3000.00', 'PENDING'],
    ]);
  });

  it('un cliente sin fiados no es «saldado»: simplemente no tiene fiados', async () => {
    const { service } = build();
    const credit = await service.getCredit('0c1c1c1c-0000-4000-8000-000000000002');

    expect(credit).toMatchObject({ balance: '0.00', hasCredit: false, settled: false, fiados: [] });
  });

  it('un cliente inexistente o de otro negocio responde 404', async () => {
    const { service } = build();

    await expect(service.getCredit('0c1c1c1c-0000-4000-8000-0000000000ff')).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      service.listPayments('0c1c1c1c-0000-4000-8000-0000000000ff'),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('registrar un abono', () => {
  it('parcial: baja la deuda, guarda monto y fecha y devuelve la ficha actualizada (criterios 2, 3 y 5)', async () => {
    const { service } = build();

    const result = await pay(service, {
      amount: '4000.00',
      paymentDate: '2026-10-20',
      notes: 'En efectivo',
    });

    expect(result.replayed).toBe(false);
    expect(result.payment).toMatchObject({
      kind: 'OPERATION',
      paymentDate: '2026-10-20',
      amount: '4000.00',
      notes: 'En efectivo',
      allocations: [{ saleNumber: 12, amount: '4000.00' }],
    });
    expect(result.credit).toMatchObject({
      balance: '5000.00',
      totalPaid: '4000.00',
      settled: false,
    });
  });

  it('sin fecha usa hoy (hora del negocio)', async () => {
    const { service } = build();

    expect((await pay(service)).payment.paymentDate).toBe(TODAY);
  });

  it('exacto: la deuda queda en cero y la cuenta se marca como saldada (criterio 4)', async () => {
    const { service } = build();
    const result = await pay(service, { amount: '9000.00' });

    expect(result.credit).toMatchObject({ balance: '0.00', settled: true });
    expect(result.credit.fiados.map((f) => f.status)).toEqual(['SETTLED', 'SETTLED']);
    expect(result.payment.allocations.map((a) => [a.saleNumber, a.amount])).toEqual([
      [12, '6000.00'],
      [15, '3000.00'],
    ]);
  });

  it('reparte FIFO: ₡7 000 saldan la #12 y dejan ₡2 000 pendientes en la #15', async () => {
    const { service } = build();
    const result = await pay(service, { amount: '7000.00' });

    expect(result.payment.allocations.map((a) => [a.saleNumber, a.amount])).toEqual([
      [12, '6000.00'],
      [15, '1000.00'],
    ]);
    expect(result.credit.balance).toBe('2000.00');
    expect(result.credit.fiados.map((f) => [f.number, f.status, f.pendingAmount])).toEqual([
      [12, 'SETTLED', '0.00'],
      [15, 'PARTIAL', '2000.00'],
    ]);
  });

  it('a un fiado específico solo toca ese fiado', async () => {
    const { service } = build();
    const result = await pay(service, { amount: '500.00', saleId: 's15' });

    expect(result.payment.allocations).toEqual([
      { saleId: 's15', saleNumber: 15, amount: '500.00' },
    ]);
    expect(result.credit.fiados.map((f) => f.paidAmount)).toEqual(['0.00', '500.00']);
  });

  it('supera la deuda: se rechaza con la diferencia y NO se guarda nada (caso C)', async () => {
    const { service, repository } = build();

    await expect(pay(service, { amount: '12000.00' })).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('supera la deuda pendiente'),
      details: { reason: 'EXCEEDS_DEBT', balance: '9000.00', excess: '3000.00' },
    });
    expect(repository.operations).toHaveLength(0);
    expect(repository.ledgerOf(CREDIT_CUSTOMER_ID).payments).toHaveLength(0);
  });

  it('sin deuda se rechaza (caso D)', async () => {
    const { service, repository } = build();

    repository.ledgerOf(CREDIT_CUSTOMER_ID).sales.length = 0;

    await expect(pay(service)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Este cliente no tiene fiados pendientes.',
    });
  });

  it('un fiado ya saldado no recibe más abonos y uno ajeno no existe', async () => {
    const { service } = build();

    await pay(service, { amount: '6000.00', saleId: 's12' });

    await expect(pay(service, { amount: '1.00', saleId: 's12' })).rejects.toMatchObject({
      statusCode: 409,
      message: 'El fiado #12 ya está saldado.',
    });
    await expect(pay(service, { amount: '1.00', saleId: randomUUID() })).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(pay(service, { amount: '3500.00', saleId: 's15' })).rejects.toMatchObject({
      statusCode: 409,
      details: { reason: 'EXCEEDS_SALE', pending: '3000.00' },
    });
  });

  it('la fecha no puede ser futura, ni anterior al fiado, ni absurda', async () => {
    const { service } = build();

    await expect(pay(service, { paymentDate: '2026-11-04' })).rejects.toMatchObject({
      statusCode: 400,
      message: 'La fecha del pago no puede ser futura.',
    });
    await expect(pay(service, { paymentDate: '1999-12-31' })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(pay(service, { paymentDate: '2026-09-30' })).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('anterior a la del fiado #12'),
    });
    // Hoy y el mismo día del fiado sí.
    await pay(service, { paymentDate: TODAY });
    await pay(service, { paymentDate: '2026-10-01' });
  });

  it('un cliente inexistente responde 404 sin escribir', async () => {
    const { service, repository } = build();

    await expect(
      service.registerPayment('0c1c1c1c-0000-4000-8000-0000000000ff', input(), USER),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(repository.recordCalls).toBe(0);
  });

  it('decide con el estado REAL al guardar: si otro abono llegó antes, el saldo ya cambió', async () => {
    const { service } = build();

    // La pantalla mostró ₡9 000, pero otro abono de ₡8 000 se registró primero.
    await pay(service, { amount: '8000.00' });

    await expect(pay(service, { amount: '8000.00' })).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('supera la deuda pendiente (₡1 000,00)'),
      details: { balance: '1000.00', excess: '7000.00' },
    });
  });
});

describe('llave de idempotencia', () => {
  it('reenviar la misma operación no cobra de nuevo y devuelve la misma operación', async () => {
    const { service, repository } = build();
    const request = input({ amount: '2500.00', notes: 'Abono' });
    const first = await service.registerPayment(CREDIT_CUSTOMER_ID, request, USER);
    const second = await service.registerPayment(CREDIT_CUSTOMER_ID, request, USER);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.payment.id).toBe(first.payment.id);
    expect(repository.operations).toHaveLength(1);
    expect(second.credit.balance).toBe('6500.00');
  });

  it('la misma llave con otros datos se rechaza', async () => {
    const { service, repository } = build();
    const key = randomUUID();

    await pay(service, { idempotencyKey: key, amount: '1000.00' });

    for (const other of [
      { amount: '2000.00' },
      { notes: 'otra nota' },
      { saleId: 's15' },
      { paymentDate: '2026-10-10' },
    ]) {
      await expect(
        pay(service, { idempotencyKey: key, amount: '1000.00', ...other }),
      ).rejects.toMatchObject({
        statusCode: 409,
        details: { reason: 'KEY_REUSED' },
      });
    }

    expect(repository.operations).toHaveLength(1);
  });

  it('la misma llave para OTRO cliente se rechaza', async () => {
    const { service, repository } = build();
    const key = randomUUID();

    repository
      .ledgerOf('0c1c1c1c-0000-4000-8000-000000000002')
      .sales.push(creditSale('o1', 1, '2026-10-01T18:00:00Z', '500'));
    await pay(service, { idempotencyKey: key });

    await expect(
      service.registerPayment(
        '0c1c1c1c-0000-4000-8000-000000000002',
        input({ idempotencyKey: key }),
        USER,
      ),
    ).rejects.toMatchObject({ statusCode: 409, details: { reason: 'KEY_REUSED' } });
  });
});

describe('historial de abonos', () => {
  it('agrupa cada operación en UNA línea con sus repartos y marca los abonos anteriores', async () => {
    const { service, repository } = build();

    repository
      .ledgerOf(CREDIT_CUSTOMER_ID)
      .payments.push(legacyPayment('500.00', '2026-10-02T18:00:00Z'));
    await pay(service, { amount: '6200.00', notes: 'Quincena' });

    const history = await service.listPayments(CREDIT_CUSTOMER_ID);

    expect(history).toHaveLength(2);

    const operation = history.find((entry) => entry.kind === 'OPERATION');
    const legacy = history.find((entry) => entry.kind === 'LEGACY');

    // Una operación de ₡6 200 que se repartió entre dos ventas sigue siendo UN abono.
    expect(operation).toMatchObject({ amount: '6200.00', notes: 'Quincena' });
    // El abono anterior (₡500, sin venta) no se atribuye a ningún fiado: la #12 recibe sus ₡6 000 completos.
    expect(operation?.allocations.map((a) => [a.saleNumber, a.amount])).toEqual([
      [12, '6000.00'],
      [15, '200.00'],
    ]);
    // El abono anterior no se reasigna: sigue sin venta.
    expect(legacy).toMatchObject({ amount: '500.00', allocations: [], paymentDate: '2026-10-02' });
  });

  it('el saldo descuenta los abonos anteriores sin atribuirlos a un fiado', async () => {
    const { service, repository } = build();

    repository.ledgerOf(CREDIT_CUSTOMER_ID).payments.push(legacyPayment('2000.00'));

    const credit = await service.getCredit(CREDIT_CUSTOMER_ID);

    expect(credit).toMatchObject({
      balance: '7000.00',
      totalPaid: '2000.00',
      unassignedPaid: '2000.00',
    });
    expect(credit.fiados.map((f) => f.paidAmount)).toEqual(['0.00', '0.00']);
    // Solo se puede pagar lo que realmente se debe.
    await expect(pay(service, { amount: '7001.00' })).rejects.toMatchObject({ statusCode: 409 });
    expect((await pay(service, { amount: '7000.00' })).credit).toMatchObject({
      balance: '0.00',
      settled: true,
    });
  });
});
