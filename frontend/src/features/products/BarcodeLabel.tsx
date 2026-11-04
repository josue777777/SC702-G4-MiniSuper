import { Modal } from '../../components/Modal';
import type { Product } from '../../types/products';
import { useState } from 'react';

const L_CODES = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
] as const;
const G_CODES = [
  '0100111',
  '0110011',
  '0011011',
  '0100001',
  '0011101',
  '0111001',
  '0000101',
  '0010001',
  '0001001',
  '0010111',
] as const;
const R_CODES = [
  '1110010',
  '1100110',
  '1101100',
  '1000010',
  '1011100',
  '1001110',
  '1010000',
  '1000100',
  '1001000',
  '1110100',
] as const;
const FIRST_DIGIT_PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
] as const;

function ean13Modules(barcode: string): string {
  if (!/^\d{13}$/.test(barcode)) {
    throw new Error('El código de barras debe tener 13 dígitos.');
  }

  const parity = FIRST_DIGIT_PARITY[Number(barcode[0])];
  const left = [...barcode.slice(1, 7)]
    .map((digit, index) => (parity[index] === 'L' ? L_CODES : G_CODES)[Number(digit)])
    .join('');
  const right = [...barcode.slice(7)].map((digit) => R_CODES[Number(digit)]).join('');

  return `101${left}01010${right}101`;
}

function barcodeSvg(barcode: string): string {
  const modules = ean13Modules(barcode);
  const bars = [...modules]
    .map((module, index) =>
      module === '1' ? `<rect x="${index + 9}" y="0" width="1" height="50"/>` : '',
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 113 50" role="img" aria-label="Código de barras ${barcode}"><rect width="113" height="50" fill="white"/>${bars}</svg>`;
}

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

  const svg = barcodeSvg(barcode);

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
      setPrintError(
        'El navegador bloqueó la ventana de impresión. Permita las ventanas emergentes e intente de nuevo.',
      );

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
        <div className="barcode-label__graphic" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="barcode-label__digits">{barcode}</p>
        <p className="muted hint">Código EAN-13 interno. No es un código comercial registrado.</p>
        {printError === null ? null : (
          <p className="form__error" role="alert">
            {printError}
          </p>
        )}
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
