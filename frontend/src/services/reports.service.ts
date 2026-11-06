import type { ExpirationAlert, LowStockAlert } from '../types/inventory';
import type { Product } from '../types/products';
import type {
  InventoryReportOptions,
  InventoryReportSection,
  InventoryReportSummary,
  PageOf,
  ReportFilter,
  ReportKind,
  ReportOptions,
  ReportRowsPage,
  ReportSummary,
} from '../types/reports';
import { apiDownload, apiGet } from './api-client';

interface DataResponse<T> {
  data: T;
}

/** Filtros de la petición: solo los que tienen valor (el servidor rechaza los desconocidos). */
function queryOf(filter: ReportFilter, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams(extra);

  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined && value !== '') {
      query.set(key, value);
    }
  }

  const text = query.toString();

  return text === '' ? '' : `?${text}`;
}

/**
 * Dónde vive cada reporte: los comerciales cuelgan de `/commercial/:kind` y el
 * de conteos tiene su propia ruta, porque usa otro permiso (`reports.inventory`).
 */
function reportPath(kind: ReportKind): string {
  return kind === 'physical-counts' ? '/api/reports/counts' : `/api/reports/commercial/${kind}`;
}

/**
 * Reportes del negocio (HU-28, HU-29, HU-30 y conteos de HU-10). La consulta y la
 * exportación comparten la misma ruta y los mismos filtros: el archivo es
 * exactamente el reporte que se muestra.
 */
export const reportsService = {
  async options(): Promise<ReportOptions> {
    return (await apiGet<DataResponse<ReportOptions>>('/api/reports/commercial/options')).data;
  },

  /** El resumen: totales, avisos y gráficos, sin las filas. */
  async get(kind: ReportKind, filter: ReportFilter): Promise<ReportSummary> {
    return (await apiGet<DataResponse<ReportSummary>>(`${reportPath(kind)}${queryOf(filter)}`))
      .data;
  },

  /** Una página del detalle («Ver detalle»), con los mismos filtros. */
  async rows(
    kind: ReportKind,
    filter: ReportFilter,
    page: number,
    pageSize: number,
  ): Promise<ReportRowsPage> {
    const query = queryOf(filter, { page: String(page), pageSize: String(pageSize) });

    return (await apiGet<DataResponse<ReportRowsPage>>(`${reportPath(kind)}/rows${query}`)).data;
  },

  /** Todas las filas: solo para el PDF, que es el documento completo. */
  async allRows(kind: ReportKind, filter: ReportFilter): Promise<ReportRowsPage> {
    const query = queryOf(filter, { all: 'true' });

    return (await apiGet<DataResponse<ReportRowsPage>>(`${reportPath(kind)}/rows${query}`)).data;
  },

  /**
   * Descarga el MISMO reporte como Excel; el nombre lo da el servidor. Con
   * `columns`, solo las columnas que el usuario dejó activas (HU-40).
   */
  export(
    kind: ReportKind,
    filter: ReportFilter,
    columns?: string[],
  ): Promise<{ blob: Blob; fileName: string }> {
    const query = queryOf(filter);
    const withColumns =
      columns === undefined
        ? query
        : `${query}${query === '' ? '?' : '&'}columns=${encodeURIComponent(columns.join(','))}`;

    return apiDownload(`${reportPath(kind)}/export${withColumns}`, `reporte-${kind}.xlsx`);
  },

  /** Resumen del reporte de inventario: totales, gráficos y cuántas filas hay. */
  async inventorySummary(options: InventoryReportOptions): Promise<InventoryReportSummary> {
    return (
      await apiGet<DataResponse<InventoryReportSummary>>(
        `/api/reports/inventory?${inventoryQuery(options)}`,
      )
    ).data;
  },

  /** Una página de una sección del reporte de inventario («Ver detalle»). */
  async inventoryRows<S extends InventoryReportSection>(
    section: S,
    options: InventoryReportOptions,
    page: number,
    pageSize: number,
  ): Promise<PageOf<InventoryRow<S>>> {
    const query = inventoryQuery(options, {
      section,
      page: String(page),
      pageSize: String(pageSize),
    });

    return (
      await apiGet<DataResponse<PageOf<InventoryRow<S>>>>(`/api/reports/inventory/rows?${query}`)
    ).data;
  },

  /** Todas las filas de una sección: solo para el PDF, que es el documento completo. */
  async inventoryAllRows<S extends InventoryReportSection>(
    section: S,
    options: InventoryReportOptions,
  ): Promise<InventoryRow<S>[]> {
    const query = inventoryQuery(options, { section, all: 'true' });

    return (
      await apiGet<DataResponse<PageOf<InventoryRow<S>>>>(`/api/reports/inventory/rows?${query}`)
    ).data.rows;
  },

  /**
   * Excel del reporte de inventario (HU-25 / HU-40) con los mismos filtros,
   * columnas y secciones que se ven en Reportes › Inventario.
   */
  exportInventory(
    options: InventoryReportOptions & { columns: string[]; grouped: boolean },
  ): Promise<{ blob: Blob; fileName: string }> {
    const query = inventoryQuery(options, {
      columns: options.columns.join(','),
      grouped: String(options.grouped),
    });

    return apiDownload(`/api/reports/inventory/export?${query}`, 'reporte-inventario.xlsx');
  },
};

/** Qué trae cada sección del reporte de inventario. */
export type InventoryRow<S extends InventoryReportSection> = S extends 'products'
  ? Product
  : S extends 'expirations'
    ? ExpirationAlert
    : LowStockAlert;

/** Filtros del reporte de inventario como parámetros de la dirección. */
function inventoryQuery(
  options: InventoryReportOptions,
  extra: Record<string, string> = {},
): string {
  const query = new URLSearchParams({
    sort: options.sort,
    sections: options.sections.join(','),
    expirations: options.expirations,
    ...extra,
  });

  if (options.categoryId !== '') {
    query.set('categoryId', options.categoryId);
  }

  return query.toString();
}
