import type {
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
 * Reportes comerciales del negocio (HU-28, HU-29, HU-30). La consulta y la
 * exportación comparten la misma ruta y los mismos filtros: el archivo es
 * exactamente el reporte que se muestra.
 */
export const reportsService = {
  async options(): Promise<ReportOptions> {
    return (await apiGet<DataResponse<ReportOptions>>('/api/reports/commercial/options')).data;
  },

  /** El resumen: totales, avisos y gráficos, sin las filas. */
  async get(kind: ReportKind, filter: ReportFilter): Promise<ReportSummary> {
    return (
      await apiGet<DataResponse<ReportSummary>>(`/api/reports/commercial/${kind}${queryOf(filter)}`)
    ).data;
  },

  /** Una página del detalle («Ver detalle»), con los mismos filtros. */
  async rows(
    kind: ReportKind,
    filter: ReportFilter,
    page: number,
    pageSize: number,
  ): Promise<ReportRowsPage> {
    const query = queryOf(filter, { page: String(page), pageSize: String(pageSize) });

    return (
      await apiGet<DataResponse<ReportRowsPage>>(`/api/reports/commercial/${kind}/rows${query}`)
    ).data;
  },

  /** Todas las filas: solo para el PDF, que es el documento completo. */
  async allRows(kind: ReportKind, filter: ReportFilter): Promise<ReportRowsPage> {
    const query = queryOf(filter, { all: 'true' });

    return (
      await apiGet<DataResponse<ReportRowsPage>>(`/api/reports/commercial/${kind}/rows${query}`)
    ).data;
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

    return apiDownload(
      `/api/reports/commercial/${kind}/export${withColumns}`,
      `reporte-${kind}.xlsx`,
    );
  },

  /**
   * Excel del reporte de inventario (HU-25 / HU-40) con los mismos filtros,
   * columnas y secciones que se ven en Reportes › Inventario.
   */
  exportInventory(options: {
    categoryId: string;
    sort: string;
    columns: string[];
    sections: string[];
    expirations: string;
    grouped: boolean;
  }): Promise<{ blob: Blob; fileName: string }> {
    const query = new URLSearchParams({
      sort: options.sort,
      columns: options.columns.join(','),
      sections: options.sections.join(','),
      expirations: options.expirations,
      grouped: String(options.grouped),
    });

    if (options.categoryId !== '') {
      query.set('categoryId', options.categoryId);
    }

    return apiDownload(
      `/api/reports/inventory/export?${query.toString()}`,
      'reporte-inventario.xlsx',
    );
  },
};
