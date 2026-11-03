import { describe, expect, it } from 'vitest';
import { dailySalesHistoryQuerySchema } from './sales.validator.js';

describe('HU-20: consulta diaria', () => {
  it('admite un día bisiesto, método y paginación; hoy es opcional', () => {
    expect(dailySalesHistoryQuerySchema.parse({})).toEqual({ page: 1, pageSize: 50 });
    expect(
      dailySalesHistoryQuerySchema.parse({
        date: '2024-02-29',
        paymentMethod: 'CREDIT',
        page: '2',
        pageSize: '10',
      }),
    ).toEqual({ date: '2024-02-29', paymentMethod: 'CREDIT', page: 2, pageSize: 10 });
  });
  it.each([
    { date: '2026-02-29' },
    { date: '2026-04-31' },
    { date: '2026-11-02T00:00:00Z' },
    { date: '' },
    { date: ['2026-11-02'] },
    { page: '0' },
    { page: '1.5' },
    { page: '1000001' },
    { pageSize: '101' },
    { pageSize: '-1' },
    { paymentMethod: 'OTHER' },
  ])('rechaza %j', (query) => {
    expect(dailySalesHistoryQuerySchema.safeParse(query).success).toBe(false);
  });
});
