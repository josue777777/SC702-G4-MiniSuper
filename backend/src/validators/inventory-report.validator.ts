import { z } from 'zod';

export const INVENTORY_REPORT_COLUMNS = [
  'code',
  'name',
  'category',
  'cost',
  'price',
  'stock',
  'value',
  'minStock',
  'expiration',
] as const;
export const INVENTORY_REPORT_SORTS = [
  'category',
  'code',
  'name',
  'stockAsc',
  'valueDesc',
] as const;
export const INVENTORY_REPORT_SECTIONS = ['products', 'expirations', 'lowStock'] as const;

/** Lista separada por comas de valores conocidos: `?columns=code,name`. */
function csvOf<T extends readonly [string, ...string[]]>(values: T, message: string) {
  return z
    .string()
    .transform((text) => text.split(','))
    .pipe(z.array(z.enum(values, { error: message })).min(1, message));
}

/**
 * Filtros del Excel del reporte de inventario (HU-25 / HU-40): los MISMOS que se
 * eligen en pantalla. `.strict()`: un filtro desconocido se rechaza.
 */
export const inventoryReportQuerySchema = z
  .object({
    categoryId: z.uuid('Categoría inválida.').optional(),
    sort: z.enum(INVENTORY_REPORT_SORTS, { error: 'Orden inválido.' }).default('category'),
    columns: csvOf(INVENTORY_REPORT_COLUMNS, 'Columnas inválidas.').optional(),
    sections: csvOf(INVENTORY_REPORT_SECTIONS, 'Secciones inválidas.').default(['products']),
    expirations: z
      .enum(['ALL', 'EXPIRED', 'EXPIRING_SOON'], { error: 'Filtro de vencimientos inválido.' })
      .default('ALL'),
    grouped: z
      .enum(['true', 'false'], { error: 'Valor inválido.' })
      .optional()
      .transform((value) => value === 'true'),
  })
  .strict();

export type InventoryReportQuery = z.infer<typeof inventoryReportQuerySchema>;
export type InventoryReportColumn = (typeof INVENTORY_REPORT_COLUMNS)[number];

/** Qué sección del detalle se pide en `GET /api/reports/inventory/rows`. */
export const inventoryRowsSectionSchema = z.enum(INVENTORY_REPORT_SECTIONS, {
  error: 'Sección inválida: use products, expirations o lowStock.',
});
