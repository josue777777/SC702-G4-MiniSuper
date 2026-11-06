import { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Modal } from '../../components/Modal';
import type { Product } from '../../types/products';
import { qrValueOf } from '../labels/label-sizes';
import { ean13Svg } from './barcode';

interface BarcodeLabelProps {
  product: Product;
  onClose: () => void;
  onReplace: () => void;
  /** Abre «Imprimir etiqueta» solo de este producto (HU-07). */
  onPrintLabels: () => void;
}

/**
 * «Ver código» (HU-07): los dos códigos del producto, uno al lado del otro.
 *   - Código de barras EAN-13: el que lee el lector de la caja.
 *   - Código QR: guarda el mismo código, para leerlo con un celular.
 * Cada uno se descarga como SVG (una imagen que se agranda sin perder calidad);
 * para rotular el producto, «Imprimir etiqueta» usa el diseño del negocio.
 */
export function BarcodeLabel({ product, onClose, onReplace, onPrintLabels }: BarcodeLabelProps) {
  const qrRef = useRef<SVGSVGElement>(null);
  const barcode = product.barcode;

  if (barcode === null) {
    return null;
  }

  const svg = ean13Svg(barcode);

  function download(filename: string, content: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: 'image/svg+xml;charset=utf-8' }));
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Modal title={`Códigos · ${product.name}`} onClose={onClose}>
      <div className="label-preview-grid">
        <section className="label-preview" aria-labelledby="barcode-title">
          <h3 id="barcode-title">Código de barras</h3>
          {/* `ean13Svg` arma el SVG solo con dígitos ya validados: no lleva texto del usuario. */}
          <div className="label-preview__barcode" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="label-preview__code">{barcode}</p>
          <button
            type="button"
            className="button"
            onClick={() => download(`codigo-barras-${barcode}.svg`, svg)}
          >
            Descargar código de barras
          </button>
        </section>
        <section className="label-preview" aria-labelledby="qr-title">
          <h3 id="qr-title">Código QR</h3>
          <QRCodeSVG
            ref={qrRef}
            value={qrValueOf(product)}
            size={150}
            level="M"
            marginSize={2}
            title={`Código QR de ${product.name}`}
          />
          <p className="muted">Contiene el mismo código: {qrValueOf(product)}</p>
          <button
            type="button"
            className="button"
            onClick={() =>
              qrRef.current === null
                ? undefined
                : download(
                    `codigo-qr-${product.code}.svg`,
                    new XMLSerializer().serializeToString(qrRef.current),
                  )
            }
          >
            Descargar código QR
          </button>
        </section>
      </div>
      <p className="muted hint">Código EAN-13 interno. No es un código comercial registrado.</p>
      <div className="form__actions modal__actions">
        <button type="button" className="button button--dark" onClick={onPrintLabels}>
          🏷 Imprimir etiqueta
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
