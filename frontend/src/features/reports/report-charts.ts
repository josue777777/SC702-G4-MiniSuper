import type { ReportKind, ReportResult } from '../../types/reports';

/** Un punto de un gráfico: etiqueta y valor numérico (colones o unidades). */
export interface ChartDatum {
  key: string;
  label: string;
  value: number;
}

export interface ReportChart {
  id: string;
  title: string;
  subtitle: string;
  /** `columns`: en el tiempo (por día); `bars`: comparar entre nombres. */
  form: 'columns' | 'bars';
  /** Cómo se escribe el valor: colones, unidades o cantidad de productos. */
  unit: 'money' | 'units' | 'products';
  data: ChartDatum[];
}

type Row = ReportResult['rows'][number];

const toNumber = (value: Row[string] | undefined): number =>
  typeof value === 'number' ? value : Number(value ?? 0) || 0;

/**
 * Suma `valueKey` agrupando por `labelKey`, de mayor a menor. Si hay más de
 * `limit` grupos, el resto se junta en «Otros»: nunca se inventan más barras.
 */
export function sumBy(
  rows: Row[],
  labelKey: string,
  valueKey: string,
  limit: number,
): ChartDatum[] {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const label = String(row[labelKey] ?? '—');

    totals.set(label, (totals.get(label) ?? 0) + toNumber(row[valueKey]));
  }

  const sorted = [...totals.entries()]
    .map(([label, value]) => ({ key: label, label, value }))
    .filter((datum) => datum.value !== 0)
    .sort((a, b) => b.value - a.value);

  if (sorted.length <= limit) {
    return sorted;
  }

  const rest = sorted.slice(limit - 1).reduce((sum, datum) => sum + datum.value, 0);

  return [...sorted.slice(0, limit - 1), { key: '__otros', label: 'Otros', value: rest }];
}

/** Suma por día (las fechas del reporte vienen como «AAAA-MM-DD HH:mm»), en orden. */
export function sumByDay(rows: Row[], valueKey: string): ChartDatum[] {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const day = String(row['date'] ?? '').slice(0, 10);

    if (day !== '') {
      totals.set(day, (totals.get(day) ?? 0) + toNumber(row[valueKey]));
    }
  }

  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, value]) => ({ key: day, label: day, value }));
}

/**
 * Los gráficos de cada reporte: lo que ayuda a decidir de un vistazo. El
 * detalle fila por fila sigue en «Ver detalle», el PDF y el Excel.
 */
export function chartsFor(kind: ReportKind, rows: Row[]): ReportChart[] {
  switch (kind) {
    case 'sales':
      return [
        {
          id: 'sales-by-day',
          title: 'Ventas por día',
          subtitle: 'Importe neto vendido cada día del período.',
          form: 'columns',
          unit: 'money',
          data: sumByDay(rows, 'net'),
        },
        {
          id: 'sales-by-category',
          title: 'Ventas por categoría',
          subtitle: 'Qué categorías venden más (importe neto).',
          form: 'bars',
          unit: 'money',
          data: sumBy(rows, 'category', 'net', 6),
        },
      ];
    case 'profits':
      return [
        {
          id: 'profits-by-day',
          title: 'Ganancia por día',
          subtitle: 'Ganancia bruta de lo cobrado cada día.',
          form: 'columns',
          unit: 'money',
          data: sumByDay(rows, 'profit'),
        },
        {
          id: 'profits-by-product',
          title: 'Productos que más ganancia dejan',
          subtitle: 'Ganancia bruta por producto en el período.',
          form: 'bars',
          unit: 'money',
          data: sumBy(rows, 'product', 'profit', 8),
        },
      ];
    case 'top-products':
      return [
        {
          id: 'top-units',
          title: 'Ranking de productos',
          subtitle: 'Unidades vendidas (ya restadas las devoluciones).',
          form: 'bars',
          unit: 'units',
          data: sumBy(rows, 'product', 'units', 10),
        },
      ];
    case 'customer-debts':
      return [
        {
          id: 'debts-by-customer',
          title: 'Quién debe más',
          subtitle: 'Monto pendiente de fiados por cliente.',
          form: 'bars',
          unit: 'money',
          data: sumBy(rows, 'customer', 'pending', 8),
        },
      ];
  }
}
