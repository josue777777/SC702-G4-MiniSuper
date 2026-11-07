import { z } from 'zod';
import { daysBetween } from '../utils/dates.js';
import { isMoney, toCents } from '../utils/money.js';

/** Un reporte carga sus ventas en memoria: se limita el período para que siga siendo ágil. */
export const MAX_REPORT_DAYS = 366;

export const reportKindSchema = z.enum(['sales', 'profits', 'top-products', 'customer-debts']);

/** Día del calendario; el rango de años evita fechas que la base no puede consultar. */
const day = z.iso
  .date('Fecha inválida: use el formato AAAA-MM-DD.')
  .refine(
    (value) => value >= '2000-01-01' && value <= '2100-12-31',
    'La fecha debe estar entre los años 2000 y 2100.',
  );

const price = z
  .string()
  .refine(isMoney, 'Precio inválido: use un importe sin signo con hasta dos decimales.');

function validPeriod(input: { from: string; to: string }, ctx: z.RefinementCtx): void {
  if (input.to < input.from) {
    ctx.addIssue({
      code: 'custom',
      path: ['to'],
      message: 'La fecha final no puede ser anterior a la inicial.',
    });
  } else if (daysBetween(input.from, input.to) >= MAX_REPORT_DAYS) {
    ctx.addIssue({
      code: 'custom',
      path: ['to'],
      message: `El período no puede superar ${MAX_REPORT_DAYS} días.`,
    });
  }
}

/**
 * `.strict()` en todos: un filtro desconocido se rechaza en lugar de ignorarse en
 * silencio (el reporte mostraría algo distinto de lo que se pidió).
 */
export const periodReportQuerySchema = z
  .object({ from: day, to: day })
  .strict()
  .superRefine(validPeriod);

export const salesReportQuerySchema = z
  .object({
    from: day,
    to: day,
    categoryId: z.uuid('Categoría inválida.').optional(),
    minPrice: price.optional(),
    maxPrice: price.optional(),
  })
  .strict()
  .superRefine(validPeriod)
  .superRefine((input, ctx) => {
    if (
      input.minPrice !== undefined &&
      input.maxPrice !== undefined &&
      isMoney(input.minPrice) &&
      isMoney(input.maxPrice) &&
      toCents(input.minPrice) > toCents(input.maxPrice)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxPrice'],
        message: 'El precio máximo debe ser mayor o igual al mínimo.',
      });
    }
  });

/** El reporte de deudas es una foto actual: no acepta filtros. */
export const debtsReportQuerySchema = z.object({}).strict();

/**
 * Columnas que el usuario dejó activas al personalizar el reporte (HU-40):
 * `?columns=sale,date,product`. Solo en la exportación; si no viene, se
 * exportan todas. Que existan en ESE reporte lo valida el controlador.
 */
export const exportColumnsSchema = z
  .string()
  .regex(/^[A-Za-z]+(,[A-Za-z]+){0,29}$/, 'Columnas inválidas.')
  .transform((value) => value.split(','))
  .optional();

/** Filas por página del detalle en pantalla, si no se indica otra cosa. */
export const DEFAULT_ROWS_PAGE_SIZE = 15;

/** Tope de filas por página: más que esto ya no es «una página». */
export const MAX_ROWS_PAGE_SIZE = 100;

const positiveInteger = (message: string) =>
  z
    .string()
    .regex(/^[1-9]\d{0,5}$/, message)
    .transform(Number);

/**
 * Qué parte del detalle se pide (`GET /:kind/rows`). En pantalla, una página
 * (`?page=3&pageSize=20`). `?all=true` trae todas: solo la usa el PDF, que es
 * el documento completo, igual que el Excel.
 */
export const rowsPageQuerySchema = z
  .object({
    page: positiveInteger('Página inválida: use un número entero desde 1.').optional(),
    pageSize: positiveInteger('Tamaño de página inválido: use un número entero desde 1.')
      .refine(
        (value) => value <= MAX_ROWS_PAGE_SIZE,
        `El tamaño de página no puede superar ${MAX_ROWS_PAGE_SIZE} filas.`,
      )
      .optional(),
    all: z.literal('true', 'Use all=true para pedir todas las filas.').optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.all !== undefined && (input.page !== undefined || input.pageSize !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['all'],
        message: 'Pida una página (page y pageSize) o todas las filas (all), no ambas.',
      });
    }
  });
