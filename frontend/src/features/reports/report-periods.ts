import { todayInBusinessZone } from './report-filters';

/** Períodos rápidos del filtro, como en los sistemas de reportes habituales. */
export type PeriodPreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'thisWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'last30'
  | 'thisYear'
  | 'custom';

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  last7: 'Últimos 7 días',
  thisWeek: 'Esta semana',
  thisMonth: 'Este mes',
  lastMonth: 'Mes pasado',
  last30: 'Últimos 30 días',
  thisYear: 'Este año',
  custom: 'Personalizado',
};

/** Suma días a una fecha `AAAA-MM-DD` (sin zonas horarias: es un día del calendario). */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

/**
 * Desde y hasta de cada período, contados en la zona del negocio (Costa Rica).
 * La semana empieza el lunes. `custom` no tiene fechas propias.
 */
export function periodRange(
  preset: Exclude<PeriodPreset, 'custom'>,
  now: Date = new Date(),
): { from: string; to: string } {
  const today = todayInBusinessZone(now);
  const firstOfMonth = `${today.slice(0, 8)}01`;

  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const yesterday = addDays(today, -1);

      return { from: yesterday, to: yesterday };
    }
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'thisWeek': {
      // getUTCDay: 0 = domingo … 6 = sábado; el lunes queda 0 días atrás.
      const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();

      return { from: addDays(today, -((weekday + 6) % 7)), to: today };
    }
    case 'thisMonth':
      return { from: firstOfMonth, to: today };
    case 'lastMonth': {
      const lastDay = addDays(firstOfMonth, -1);

      return { from: `${lastDay.slice(0, 8)}01`, to: lastDay };
    }
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'thisYear':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

const PRESETS = Object.keys(PERIOD_LABELS).filter(
  (key): key is Exclude<PeriodPreset, 'custom'> => key !== 'custom',
);

/** Qué período rápido corresponde a esas fechas; si ninguno, «Personalizado». */
export function presetOf(from: string, to: string, now: Date = new Date()): PeriodPreset {
  return (
    PRESETS.find((preset) => {
      const range = periodRange(preset, now);

      return range.from === from && range.to === to;
    }) ?? 'custom'
  );
}
