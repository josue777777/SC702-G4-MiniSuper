/**
 * Lo que el usuario personaliza de cada reporte (HU-40): qué columnas oculta y
 * la orientación de la hoja del PDF. Se recuerda en este navegador, por
 * reporte, para la próxima vez. Es una comodidad: si el navegador no deja
 * guardar, el reporte funciona igual con todo visible.
 */

export type Orientation = 'portrait' | 'landscape';

export interface ReportPreferences {
  /** Columnas apagadas. Se guardan las ocultas para que una columna nueva aparezca visible. */
  hidden: string[];
  orientation: Orientation;
}

export const DEFAULT_REPORT_PREFERENCES: ReportPreferences = {
  hidden: [],
  orientation: 'portrait',
};

const storageKey = (reportId: string) => `minisuper.reportes.${reportId}`;

export function loadReportPreferences(reportId: string): ReportPreferences {
  try {
    const raw = window.localStorage.getItem(storageKey(reportId));
    const parsed: unknown = raw === null ? null : JSON.parse(raw);

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray((parsed as ReportPreferences).hidden)
    ) {
      const value = parsed as ReportPreferences;

      return {
        hidden: value.hidden.filter((key) => typeof key === 'string'),
        orientation: value.orientation === 'landscape' ? 'landscape' : 'portrait',
      };
    }
  } catch {
    // Sin almacenamiento (modo privado, bloqueado): se usan los valores por defecto.
  }

  return DEFAULT_REPORT_PREFERENCES;
}

export function saveReportPreferences(reportId: string, preferences: ReportPreferences): void {
  try {
    window.localStorage.setItem(storageKey(reportId), JSON.stringify(preferences));
  } catch {
    // No se pudo recordar: la personalización vale solo para esta vez.
  }
}

/**
 * Las columnas visibles, en el orden del reporte. La primera nunca se oculta:
 * sin ella la fila no se entiende (y siempre queda al menos una columna).
 */
export function visibleReportColumns<T extends { key: string }>(
  columns: T[],
  preferences: ReportPreferences,
): T[] {
  return columns.filter((column, index) => index === 0 || !preferences.hidden.includes(column.key));
}

/** Imprime solo `.print-area`: la hoja de estilos de impresión oculta el resto. */
export function printReport(): void {
  document.body.classList.add('printing-report');
  window.addEventListener('afterprint', () => document.body.classList.remove('printing-report'), {
    once: true,
  });
  window.print();
}
