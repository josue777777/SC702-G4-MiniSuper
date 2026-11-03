import type { ReportFilter, ReportKind } from '../../types/reports';

/** Valores de los campos tal como se escriben (texto), antes de validar. */
export interface FilterDraft {
  from: string;
  to: string;
  categoryId: string;
  minPrice: string;
  maxPrice: string;
}

export type FilterErrors = Partial<Record<keyof FilterDraft, string>>;

/** Mismo máximo que el servidor (`MAX_REPORT_DAYS`). */
const MAX_DAYS = 366;
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const BUSINESS_TIME_ZONE = 'America/Costa_Rica';

/** Los reportes por período; el de deudas es la foto actual y no tiene filtros. */
export function hasFilters(kind: ReportKind): boolean {
  return kind !== 'customer-debts';
}

/** Solo el reporte de ventas filtra por categoría y precio. */
export function hasProductFilters(kind: ReportKind): boolean {
  return kind === 'sales';
}

/** Día de hoy (`YYYY-MM-DD`) en la zona horaria del negocio. */
export function todayInBusinessZone(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: BUSINESS_TIME_ZONE });
}

/** Período inicial: desde el primer día del mes hasta hoy. */
export function defaultDraft(now: Date = new Date()): FilterDraft {
  const today = todayInBusinessZone(now);

  return { from: `${today.slice(0, 8)}01`, to: today, categoryId: '', minPrice: '', maxPrice: '' };
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function isRealDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Errores visibles de los filtros del reporte; vacío si se puede consultar. */
export function validateFilters(kind: ReportKind, draft: FilterDraft): FilterErrors {
  const errors: FilterErrors = {};

  if (!hasFilters(kind)) {
    return errors;
  }

  if (draft.from === '') {
    errors.from = 'Indique la fecha inicial.';
  } else if (!isRealDate(draft.from)) {
    errors.from = 'La fecha inicial no es válida.';
  }

  if (draft.to === '') {
    errors.to = 'Indique la fecha final.';
  } else if (!isRealDate(draft.to)) {
    errors.to = 'La fecha final no es válida.';
  }

  if (errors.from === undefined && errors.to === undefined) {
    if (draft.to < draft.from) {
      errors.to = 'La fecha final no puede ser anterior a la inicial.';
    } else if (daysBetween(draft.from, draft.to) >= MAX_DAYS) {
      errors.to = `El período no puede superar ${MAX_DAYS} días.`;
    }
  }

  if (hasProductFilters(kind)) {
    for (const key of ['minPrice', 'maxPrice'] as const) {
      if (draft[key] !== '' && !MONEY.test(draft[key])) {
        errors[key] = 'Use un importe sin signo y con hasta dos decimales.';
      }
    }

    if (
      errors.minPrice === undefined &&
      errors.maxPrice === undefined &&
      draft.minPrice !== '' &&
      draft.maxPrice !== '' &&
      Number(draft.minPrice) > Number(draft.maxPrice)
    ) {
      errors.maxPrice = 'El precio máximo debe ser mayor o igual al mínimo.';
    }
  }

  return errors;
}

/** Filtros que se envían al servidor: solo los que aplican al reporte y tienen valor. */
export function toFilter(kind: ReportKind, draft: FilterDraft): ReportFilter {
  if (!hasFilters(kind)) {
    return {};
  }

  const filter: ReportFilter = { from: draft.from, to: draft.to };

  if (hasProductFilters(kind)) {
    if (draft.categoryId !== '') {
      filter.categoryId = draft.categoryId;
    }

    if (draft.minPrice !== '') {
      filter.minPrice = draft.minPrice;
    }

    if (draft.maxPrice !== '') {
      filter.maxPrice = draft.maxPrice;
    }
  }

  return filter;
}
