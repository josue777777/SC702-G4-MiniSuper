import { describe, expect, it } from 'vitest';
import {
  debtsReportQuerySchema,
  MAX_REPORT_DAYS,
  periodReportQuerySchema,
  salesReportQuerySchema,
} from './reports.validator.js';

/** Filtros de los reportes comerciales (HU-28, HU-29, HU-30). */

const CATEGORY = '0c000000-0000-4000-8000-000000000001';

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('salesReportQuerySchema', () => {
  it('acepta fechas y combina categoría y precios', () => {
    const parsed = salesReportQuerySchema.parse({
      from: '2026-10-01',
      to: '2026-10-31',
      categoryId: CATEGORY,
      minPrice: '100',
      maxPrice: '2500.50',
    });

    expect(parsed).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
      categoryId: CATEGORY,
      minPrice: '100',
      maxPrice: '2500.50',
    });
  });

  it('exige ambas fechas', () => {
    expect(salesReportQuerySchema.safeParse({ from: '2026-10-01' }).success).toBe(false);
    expect(salesReportQuerySchema.safeParse({ to: '2026-10-01' }).success).toBe(false);
    expect(salesReportQuerySchema.safeParse({}).success).toBe(false);
  });

  it('rechaza fechas que no existen o con otro formato', () => {
    for (const from of ['2026-02-30', '2026-13-01', '01/10/2026', '2026-10-1', '']) {
      expect(salesReportQuerySchema.safeParse({ from, to: '2026-12-01' }).success, from).toBe(
        false,
      );
    }
  });

  it('rechaza años fuera de rango que la base no puede consultar', () => {
    expect(salesReportQuerySchema.safeParse({ from: '1999-12-31', to: '2000-01-02' }).success).toBe(
      false,
    );
    expect(salesReportQuerySchema.safeParse({ from: '2100-12-30', to: '2101-01-01' }).success).toBe(
      false,
    );
  });

  it('rechaza una fecha final anterior a la inicial', () => {
    const result = salesReportQuerySchema.safeParse({ from: '2026-10-05', to: '2026-10-04' });

    expect(messages(result)).toContain('La fecha final no puede ser anterior a la inicial.');
  });

  it('permite un solo día y exactamente el período máximo, pero no más', () => {
    expect(salesReportQuerySchema.safeParse({ from: '2026-10-05', to: '2026-10-05' }).success).toBe(
      true,
    );
    // 2026-01-01 → 2027-01-01 son 366 días contando ambos extremos: el máximo permitido.
    expect(salesReportQuerySchema.safeParse({ from: '2026-01-01', to: '2027-01-01' }).success).toBe(
      true,
    );

    const result = salesReportQuerySchema.safeParse({ from: '2026-01-01', to: '2027-01-02' });

    expect(messages(result)).toContain(`El período no puede superar ${MAX_REPORT_DAYS} días.`);
  });

  it('valida los precios: sin signo, con hasta dos decimales y mínimo ≤ máximo', () => {
    const base = { from: '2026-10-01', to: '2026-10-31' };

    for (const minPrice of ['-1', 'abc', '1.234', '', '1e3']) {
      expect(salesReportQuerySchema.safeParse({ ...base, minPrice }).success, minPrice).toBe(false);
    }

    const crossed = salesReportQuerySchema.safeParse({
      ...base,
      minPrice: '500',
      maxPrice: '499.99',
    });

    expect(messages(crossed)).toContain('El precio máximo debe ser mayor o igual al mínimo.');
    expect(
      salesReportQuerySchema.safeParse({ ...base, minPrice: '500', maxPrice: '500' }).success,
    ).toBe(true);
  });

  it('rechaza una categoría que no es un UUID y los filtros desconocidos', () => {
    const base = { from: '2026-10-01', to: '2026-10-31' };

    expect(salesReportQuerySchema.safeParse({ ...base, categoryId: 'granos' }).success).toBe(false);
    expect(salesReportQuerySchema.safeParse({ ...base, businessId: CATEGORY }).success).toBe(false);
  });
});

describe('periodReportQuerySchema (ganancias y más vendidos)', () => {
  it('solo acepta el período', () => {
    expect(
      periodReportQuerySchema.safeParse({ from: '2026-10-01', to: '2026-10-02' }).success,
    ).toBe(true);
    expect(
      periodReportQuerySchema.safeParse({ from: '2026-10-01', to: '2026-10-02', minPrice: '1' })
        .success,
    ).toBe(false);
  });
});

describe('debtsReportQuerySchema', () => {
  it('no acepta ningún filtro', () => {
    expect(debtsReportQuerySchema.safeParse({}).success).toBe(true);
    expect(debtsReportQuerySchema.safeParse({ businessId: CATEGORY }).success).toBe(false);
  });
});
