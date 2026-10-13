import { describe, expect, it } from 'vitest';
import { daysBetween, todayInBusinessZone } from './dates.js';

/** Utilidades de fechas sin hora usadas por los vencimientos (HU-09). */
describe('todayInBusinessZone', () => {
  it('usa el día de Costa Rica aunque en UTC ya sea el día siguiente', () => {
    // 2026-10-14 03:00 UTC = 2026-10-13 21:00 en Costa Rica (UTC-6).
    expect(todayInBusinessZone(new Date('2026-10-14T03:00:00Z'))).toBe('2026-10-13');
  });
});

describe('daysBetween', () => {
  it('cuenta días de calendario hacia adelante y hacia atrás', () => {
    expect(daysBetween('2026-10-13', '2026-10-28')).toBe(15);
    expect(daysBetween('2026-10-13', '2026-10-13')).toBe(0);
    expect(daysBetween('2026-10-13', '2026-10-10')).toBe(-3);
  });

  it('funciona al cruzar de mes y de año', () => {
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
  });
});
