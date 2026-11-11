/** Pruebas unitarias del historial del cliente (HU-36). */
import { describe, expect, it } from 'vitest';
import type { CreditService } from './credit.service.js';
import { CustomerHistoryService } from './customer-history.service.js';
import type { CreditSummaryDto } from '../types/credit.js';
import type { SaleRecord } from '../types/sales.js';

/** Historial HU-36: combina ventas paginadas con los saldos derivados de HU-19. */
describe('CustomerHistoryService', () => {
  it('incluye compras al contado y distingue fiados pendientes, parciales y liquidados', async () => {
    const sales = [
      sale('settled', 3, 'CREDIT'),
      sale('partial', 2, 'CREDIT'),
      sale('cash', 2, 'CASH'),
      sale('pending', 1, 'CREDIT'),
    ];
    const service = new CustomerHistoryService(
      { customerHistory: async () => ({ sales, total: sales.length }) },
      {
        getCredit: async () =>
          ({
            customer: { id: 'customer', name: 'Cliente', phone: null, isActive: true },
            balance: '150.00',
            totalCredited: '300.00',
            totalPaid: '150.00',
            unassignedPaid: '0.00',
            settled: false,
            hasCredit: true,
            fiados: [
              {
                saleId: 'pending',
                number: 1,
                createdAt: '2026-01-01T10:00:00.000Z',
                originalAmount: '100.00',
                effectiveAmount: '100.00',
                paidAmount: '0.00',
                pendingAmount: '100.00',
                status: 'PENDING',
              },
              {
                saleId: 'settled',
                number: 3,
                createdAt: '2026-01-03T10:00:00.000Z',
                originalAmount: '200.00',
                effectiveAmount: '200.00',
                paidAmount: '200.00',
                pendingAmount: '0.00',
                status: 'SETTLED',
              },
              {
                saleId: 'partial',
                number: 2,
                createdAt: '2026-01-02T10:00:00.000Z',
                originalAmount: '100.00',
                effectiveAmount: '100.00',
                paidAmount: '50.00',
                pendingAmount: '50.00',
                status: 'PARTIAL',
              },
            ],
          }) satisfies CreditSummaryDto,
      } as Pick<CreditService, 'getCredit'>,
    );

    const history = await service.getPurchases('customer', 1, 15);

    expect(history).toMatchObject({
      page: 1,
      pageSize: 15,
      total: 4,
      pageCount: 1,
    });
    expect(history.sales.map(({ id }) => id)).toEqual(['settled', 'partial', 'cash', 'pending']);
    expect(history.sales.map(({ credit }) => credit?.status ?? null)).toEqual([
      'SETTLED',
      'PARTIAL',
      null,
      'PENDING',
    ]);
  });
});

function sale(id: string, number: number, paymentMethod: 'CASH' | 'CREDIT'): SaleRecord {
  return {
    id,
    number,
    createdAt: `2026-01-0${number}T10:00:00.000Z`,
    paymentMethod,
    status: 'COMPLETED',
    total: '100.00',
    originalTotal: '100.00',
    cashReceived: null,
    customer: { id: 'customer', name: 'Cliente' },
    items: [],
    adjustments: [],
  };
}
