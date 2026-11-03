/**
 * Contratos de los reportes comerciales (HU-28, HU-29, HU-30). Reflejan
 * backend/src/types/reports.ts. Todos los reportes tienen la misma forma: lo
 * que se ve en pantalla y lo que se exporta a Excel salen del mismo resultado.
 *
 * Dinero: cadenas con dos decimales (`"1500.00"`).
 */

export type ReportKind = 'sales' | 'profits' | 'top-products' | 'customer-debts';

/** Lo que el usuario puede filtrar. Las fechas son días (`YYYY-MM-DD`) de Costa Rica. */
export interface ReportFilter {
  from?: string;
  to?: string;
  /** Solo ventas: categoría ACTUAL del producto. */
  categoryId?: string;
  /** Solo ventas: precio histórico de la línea. */
  minPrice?: string;
  maxPrice?: string;
}

export interface ReportColumn {
  key: string;
  label: string;
  /** Importe en colones. */
  money?: boolean;
}

export interface ReportTotal {
  label: string;
  value: string | number;
  money?: boolean;
}

export interface ReportResult {
  kind: ReportKind;
  title: string;
  businessName: string;
  /** Momento de la consulta (ISO 8601). */
  generatedAt: string;
  filters: { label: string; value: string }[];
  /** Reglas y límites para interpretar las cifras. */
  notices: string[];
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  totals: ReportTotal[];
  emptyMessage: string;
}

export interface ReportOptions {
  categories: { id: string; name: string }[];
}
