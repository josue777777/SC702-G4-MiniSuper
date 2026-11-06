/**
 * Contratos de los reportes comerciales (HU-28, HU-29, HU-30). Reflejan
 * backend/src/types/reports.ts. Todos los reportes tienen la misma forma: lo
 * que se ve en pantalla y lo que se exporta a Excel salen del mismo resultado.
 *
 * Dinero: cadenas con dos decimales (`"1500.00"`).
 */

/**
 * Reportes con el formato común (`ReportSummary`). `physical-counts` es el de
 * conteos físicos (HU-10, permiso `reports.inventory`); los demás son comerciales.
 */
export type ReportKind =
  'sales' | 'profits' | 'top-products' | 'customer-debts' | 'physical-counts';

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

/** Una página de una lista pedida al servidor (refleja `backend/src/utils/paginate.ts`). */
export interface PageOf<T> {
  rows: T[];
  /** Página devuelta (desde 1); si se pidió una que ya no existe, la última. */
  page: number;
  pageSize: number;
  /** Filas de la lista completa, no solo de esta página. */
  total: number;
  pageCount: number;
}

/** Una página del detalle de un reporte comercial. */
export type ReportRowsPage = PageOf<ReportResult['rows'][number]>;

export interface ReportOptions {
  categories: { id: string; name: string }[];
}

/** Las secciones del reporte de inventario, cada una con sus propias filas. */
export type InventoryReportSection = 'products' | 'expirations' | 'lowStock';

/** Filtros del reporte de inventario: los que se eligen en Reportes › Inventario. */
export interface InventoryReportOptions {
  categoryId: string;
  sort: string;
  sections: InventoryReportSection[];
  expirations: string;
}

/**
 * El reporte de inventario para la pantalla: totales, gráficos y cuántas filas
 * tiene cada sección, SIN las filas (refleja `InventoryReportSummary` del
 * servidor). Las filas llegan aparte, de a una página, al abrir «Ver detalle».
 */
export interface InventoryReportSummary {
  /** «Todas» o el nombre de la categoría. */
  scope: string;
  generatedAt: string;
  totals: { count: number; units: number; value: string };
  charts: ReportChart[];
  /** `null`: la sección no se eligió. */
  counts: { products: number; expirations: number | null; lowStock: number | null };
}
