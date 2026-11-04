import { NavIcon } from '../../layouts/NavIcon';

interface ReportActionsProps {
  /** Nombre del reporte para los lectores de pantalla («reporte de ventas»). */
  title: string;
  /** Si no hay datos, no se exporta un archivo vacío (HU-40): se dice por qué. */
  emptyReason: string | null;
  exportingExcel: boolean;
  onPdf: () => void;
  onExcel: () => void;
  onCustomize: () => void;
}

/**
 * Acciones de un reporte, arriba a la derecha (HU-40): descargar en PDF o en
 * Excel y personalizar las columnas. Las mismas en todos los reportes.
 */
export function ReportActions({
  title,
  emptyReason,
  exportingExcel,
  onPdf,
  onExcel,
  onCustomize,
}: ReportActionsProps) {
  const name = title.toLowerCase();

  return (
    <div className="report-actions">
      <div className="report-actions__group" role="group" aria-label="Acciones del reporte">
        <button
          type="button"
          className="report-actions__button"
          disabled={emptyReason !== null}
          title={emptyReason ?? 'Vista previa para imprimir o guardar en PDF'}
          aria-label={`Descargar ${name} en PDF`}
          onClick={onPdf}
        >
          <NavIcon name="file" size={18} />
          PDF
        </button>
        <button
          type="button"
          className="report-actions__button"
          disabled={emptyReason !== null || exportingExcel}
          title={emptyReason ?? 'Descargar en Excel (.xlsx)'}
          aria-label={`Exportar ${name} a Excel`}
          onClick={onExcel}
        >
          <NavIcon name="download" size={18} />
          {exportingExcel ? 'Exportando…' : 'Excel'}
        </button>
        <button
          type="button"
          className="report-actions__button"
          title="Elegir columnas y formato"
          aria-label="Personalizar reporte"
          onClick={onCustomize}
        >
          <NavIcon name="sliders" size={18} />
          Personalizar
        </button>
      </div>
      {emptyReason === null ? null : (
        <span className="muted report-actions__note">{emptyReason}</span>
      )}
    </div>
  );
}
