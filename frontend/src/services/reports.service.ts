import type { ReportFilter, ReportKind, ReportOptions, ReportResult } from '../types/reports';
import { apiDownload, apiGet } from './api-client';

interface DataResponse<T> {
  data: T;
}

/** Filtros de la petición: solo los que tienen valor (el servidor rechaza los desconocidos). */
function queryOf(filter: ReportFilter): string {
  const query = new URLSearchParams();

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

  async get(kind: ReportKind, filter: ReportFilter): Promise<ReportResult> {
    return (
      await apiGet<DataResponse<ReportResult>>(`/api/reports/commercial/${kind}${queryOf(filter)}`)
    ).data;
  },

  /** Descarga el MISMO reporte como Excel; el nombre lo da el servidor. */
  export(kind: ReportKind, filter: ReportFilter): Promise<{ blob: Blob; fileName: string }> {
    return apiDownload(
      `/api/reports/commercial/${kind}/export${queryOf(filter)}`,
      `reporte-${kind}.xlsx`,
    );
  },
};
