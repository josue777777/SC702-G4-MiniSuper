import { describe, expect, it } from 'vitest';
import { chartsFor, sumBy, sumByDay } from './report-charts.js';

/**
 * Gráficos de los reportes: se calculan en el servidor con TODAS las filas,
 * para que la pantalla no tenga que recibirlas.
 */
describe('sumBy', () => {
  it('agrupa, ordena de mayor a menor y junta el resto en «Otros»', () => {
    const rows = [
      { category: 'A', net: '10.10' },
      { category: 'B', net: '30.00' },
      { category: 'A', net: '10.20' },
      { category: 'C', net: '5.00' },
      { category: 'D', net: '1.00' },
    ];

    expect(sumBy(rows, 'category', 'net', 3)).toEqual([
      { key: 'B', label: 'B', value: 30 },
      { key: 'A', label: 'A', value: 20.3 },
      { key: '__otros', label: 'Otros', value: 6 },
    ]);
  });

  it('no dibuja barras en cero', () => {
    expect(sumBy([{ customer: 'Ana', pending: '0.00' }], 'customer', 'pending', 8)).toEqual([]);
  });
});

describe('sumByDay', () => {
  it('suma por día en orden de calendario', () => {
    const rows = [
      { date: '2026-10-02 08:00', net: 5 },
      { date: '2026-10-01 18:00', net: 2 },
      { date: '2026-10-02 19:30', net: 1 },
    ];

    expect(sumByDay(rows, 'net')).toEqual([
      { key: '2026-10-01', label: '2026-10-01', value: 2 },
      { key: '2026-10-02', label: '2026-10-02', value: 6 },
    ]);
  });
});

describe('chartsFor', () => {
  it('cada reporte tiene sus gráficos', () => {
    expect(chartsFor('sales', []).map((chart) => chart.id)).toEqual([
      'sales-by-day',
      'sales-by-category',
    ]);
    expect(chartsFor('profits', []).map((chart) => chart.id)).toEqual([
      'profits-by-day',
      'profits-by-product',
    ]);
    expect(chartsFor('top-products', []).map((chart) => chart.id)).toEqual(['top-units']);
    expect(chartsFor('customer-debts', []).map((chart) => chart.id)).toEqual(['debts-by-customer']);
  });
});
