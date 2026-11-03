import { describe, expect, it } from 'vitest';
import {
  businessDayRange,
  daysBetween,
  formatBusinessDateTime,
  todayInBusinessZone,
} from './dates.js';

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

describe('businessDayRange', () => {
  it('abarca desde el inicio del primer día hasta el final del último, en hora de Costa Rica', () => {
    const { start, end } = businessDayRange('2026-10-13', '2026-10-14');

    expect(start.toISOString()).toBe('2026-10-13T06:00:00.000Z');
    // Medianoche CR del 15: una venta a las 23:59 del 14 (05:59 UTC del 15) sí entra.
    expect(end.toISOString()).toBe('2026-10-15T06:00:00.000Z');
  });

  it('un solo día cubre exactamente 24 horas', () => {
    const { start, end } = businessDayRange('2026-02-28', '2026-02-28');

    expect(end.getTime() - start.getTime()).toBe(86_400_000);
  });

  it('cruza fin de mes y de año', () => {
    expect(businessDayRange('2026-12-31', '2026-12-31').end.toISOString()).toBe(
      '2027-01-01T06:00:00.000Z',
    );
  });
});

describe('formatBusinessDateTime', () => {
  it('muestra la hora de Costa Rica con formato fijo', () => {
    expect(formatBusinessDateTime(new Date('2026-10-14T03:05:00Z'))).toBe('2026-10-13 21:05');
  });

  it('usa 00:00 (no 24:00) a la medianoche del negocio', () => {
    expect(formatBusinessDateTime(new Date('2026-10-14T06:00:00Z'))).toBe('2026-10-14 00:00');
  });
});
