import { describe, expect, it } from 'vitest';
import { formatCents, formatColones, isMoney, toCents } from './money.js';

describe('money', () => {
  it('convierte a céntimos y de vuelta sin errores de punto flotante', () => {
    expect(toCents('1234.5')).toBe(123450n);
    expect(toCents('0.10') + toCents('0.20')).toBe(30n);
    expect(formatCents(toCents('0.10') + toCents('0.20'))).toBe('0.30');
    expect(formatCents(123450n)).toBe('1234.50');
    expect(formatCents(5n)).toBe('0.05');
    expect(formatCents(-250n)).toBe('-2.50');
  });

  it('valida el formato de un importe', () => {
    expect(isMoney('1500')).toBe(true);
    expect(isMoney('1500.00')).toBe(true);
    expect(isMoney('1500.001')).toBe(false);
    expect(isMoney('-5')).toBe(false);
    expect(isMoney('1e3')).toBe(false);
    expect(isMoney('')).toBe(false);
    expect(() => toCents('abc')).toThrow();
  });
});

describe('formatColones', () => {
  it('agrupa los miles con espacio y usa coma decimal', () => {
    expect(formatColones(0n)).toBe('₡0,00');
    expect(formatColones(5n)).toBe('₡0,05');
    expect(formatColones(200_000n)).toBe('₡2 000,00');
    expect(formatColones(123_456_789n)).toBe('₡1 234 567,89');
    expect(formatColones(-150_000n)).toBe('-₡1 500,00');
  });
});
