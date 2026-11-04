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
  /** El dato principal: se muestra destacado sobre el resto. */
  primary?: true;
}

export interface ReportResult {
  kind: ReportKind;
  title: string;
  businessName: string;
  /** Momento de la consulta (ISO 8601). */
  generatedAt: string;
  /** `isDefault`: filtro no usado («Todas», «Sin mínimo»); la pantalla no lo repite. */
  filters: { label: string; value: string; isDefault?: true }[];
  /** Cómo se calcula, en pocas palabras. */
  help: string[];
  /** Avisos que aplican a este resultado; vacío si no hay nada que advertir. */
  warnings: string[];
  /** Reglas y límites técnicos completos (también van en el Excel). */
  notices: string[];
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  totals: ReportTotal[];
  emptyMessage: string;
}

/** Un punto de un gráfico: etiqueta y valor (colones o unidades). */
export interface ReportChartDatum {
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
  data: ReportChartDatum[];
}

/**
 * El reporte para la pantalla: totales, avisos y gráficos (ya calculados en el
 * servidor), SIN las filas. Las filas pueden ser miles: llegan aparte, de a
 * una página, solo al abrir «Ver detalle» (`ReportRowsPage`).
 */
export interface ReportSummary extends Omit<ReportResult, 'rows'> {
  /** Cuántas filas tiene el detalle completo. */
  rowCount: number;
  charts: ReportChart[];
}

/** Una página del detalle de un reporte. */
export interface ReportRowsPage {
  rows: ReportResult['rows'];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export interface ReportOptions {
  categories: { id: string; name: string }[];
}
