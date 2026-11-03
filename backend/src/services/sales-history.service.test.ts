import { describe, expect, it, vi } from 'vitest';
import { FakeCustomersRepository, FakeSalesRepository } from '../testing/sales.repository.fake.js';
import { SalesService } from './sales.service.js';

describe('HU-20: intervalo del día del negocio', () => {
  it.each([
    ['2026-11-03T05:59:59.999Z', undefined, '2026-11-02'],
    ['2026-11-03T06:00:00.000Z', undefined, '2026-11-03'],
    ['2026-11-03T06:00:00.000Z', '2024-02-29', '2024-02-29'],
  ])('resuelve ahora=%s, día=%s', async (now, date, expected) => {
    const repository = new FakeSalesRepository();
    const spy = vi.spyOn(repository, 'dailyHistory');
    const service = new SalesService(repository, new FakeCustomersRepository(repository));
    const filter = { ...(date === undefined ? {} : { date }), page: 2, pageSize: 50 };
    const result = await service.getDailyHistory(filter, new Date(now));
    const start = new Date(`${expected}T06:00:00.000Z`);
    expect(spy).toHaveBeenCalledWith(start, new Date(start.getTime() + 86_400_000), filter);
    expect(result).toMatchObject({
      date: expected,
      page: 2,
      pageSize: 50,
      matchingCount: 0,
      day: { saleCount: 0, originalTotal: '0.00', total: '0.00' },
    });
  });
});
