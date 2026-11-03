import { Modal } from '../../components/Modal';
import type { Product } from '../../types/products';
import { useState } from 'react';
import { ean13Svg } from './barcode';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };

    return entities[character] ?? character;
  });
}

interface BarcodeLabelProps {
  product: Product;
  onClose: () => void;
  onReplace: () => void;
}

/** Vista de etiqueta EAN-13 con descarga SVG e impresión. */
export function BarcodeLabel({ product, onClose, onReplace }: BarcodeLabelProps) {
  const barcode = product.barcode;
  const [printError, setPrintError] = useState<string | null>(null);

  if (barcode === null) {
    return null;
  }

  const svg = ean13Svg(barcode);

  function downloadSvg(): void {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `codigo-barras-${barcode}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function printLabel(): void {
    const printWindow = window.open('', '_blank');

    if (printWindow === null) {
      setPrintError('El navegador bloqueó la ventana de impresión. Permita las ventanas emergentes e intente de nuevo.');

      return;
    }

    printWindow.document.write(
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiqueta ${barcode}</title><style>body{font-family:Arial,sans-serif;text-align:center;margin:24px}.label{width:320px;margin:auto}.label svg{width:100%;height:auto}.name{font-size:16px;margin:0 0 8px}.digits{font-family:monospace;letter-spacing:3px;margin:0}</style></head><body><main class="label"><p class="name">${escapeHtml(product.name)}</p>${svg}<p class="digits">${barcode}</p></main><script>window.onload=()=>{window.print();window.close()}</script></body></html>`,
    );
    printWindow.document.close();
  }

  return (
    <Modal title={`Código de barras · ${product.name}`} onClose={onClose}>
      <div className="barcode-label">
        <p className="barcode-label__name">{product.name}</p>
        <div
          className="barcode-label__graphic"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="barcode-label__digits">{barcode}</p>
        <p className="muted hint">
          Código EAN-13 interno. No es un código comercial registrado.
        </p>
        {printError === null ? null : <p className="form__error" role="alert">{printError}</p>}
      </div>
      <div className="form__actions modal__actions">
        <button type="button" className="button button--dark" onClick={printLabel}>
          Imprimir
        </button>
        <button type="button" className="button" onClick={downloadSvg}>
          Descargar SVG
        </button>
        <button type="button" className="button" onClick={onReplace}>
          Reemplazar código
        </button>
        <button type="button" className="button" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
