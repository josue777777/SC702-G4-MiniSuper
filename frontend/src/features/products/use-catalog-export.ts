import { useCallback, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { productsService } from '../../services/products.service';

export interface ExportNotice {
  kind: 'success' | 'error';
  text: string;
}

/** Guarda el archivo descargado con el nombre indicado por el servidor. */
function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Exportar el catálogo a Excel (HU-33). La generación ocurre en el servidor y la
 * pantalla sigue usable: solo el botón de exportar queda ocupado mientras tanto.
 */
export function useCatalogExport() {
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<ExportNotice | null>(null);

  const exportCatalog = useCallback(async (categoryId: string): Promise<void> => {
    setExporting(true);
    setNotice(null);

    try {
      const { blob, fileName } = await productsService.exportCatalog(categoryId || undefined);

      saveBlob(blob, fileName);
      setNotice({ kind: 'success', text: `Catálogo exportado: ${fileName}` });
    } catch (caught) {
      setNotice({
        kind: 'error',
        text:
          caught instanceof ApiError
            ? caught.message
            : 'No se pudo exportar el catálogo. Intente de nuevo.',
      });
    } finally {
      setExporting(false);
    }
  }, []);

  const dismiss = useCallback(() => setNotice(null), []);

  return { exporting, notice, exportCatalog, dismiss };
}
