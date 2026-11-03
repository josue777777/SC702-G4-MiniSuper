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
