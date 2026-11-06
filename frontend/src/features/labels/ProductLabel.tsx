import type { CSSProperties } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { LabelDesign } from '../../types/labels';
import type { Product } from '../../types/products';
import { ean13Modules } from '../products/barcode';
import { formatMoney } from '../products/money';
import { qrValueOf, type LabelSizeSpec } from './label-sizes';

/** Lo que la etiqueta toma del producto. */
export type LabelProduct = Pick<Product, 'code' | 'name' | 'price' | 'barcode'>;

/** Lo que la etiqueta toma del negocio (Configuración › General). */
export interface LabelBusiness {
  name: string;
  /** Logo como `data:` URL (así se imprime aunque la ventana de impresión no tenga sesión), o `null`. */
  logo: string | null;
}

interface ProductLabelProps {
  product: LabelProduct;
  design: LabelDesign;
  spec: LabelSizeSpec;
  business: LabelBusiness;
}

/**
 * UNA etiqueta de producto (HU-07), del tamaño exacto en milímetros.
 *
 * Los estilos van en línea a propósito: dependen del tamaño elegido (58 × 40,
 * 50 × 25…) y la misma etiqueta se dibuja en la vista previa y en la ventana de
 * impresión, que no carga la hoja de estilos de la aplicación.
 *
 * El tamaño de letra se calcula con la altura: `u` vale 1 en la etiqueta de
 * 40 mm de alto y se achica o agranda en proporción (en 25,4 mm, `u` = 0,635).
 */
export function ProductLabel({ product, design, spec, business }: ProductLabelProps) {
  const { show } = design;
  const u = spec.height / 40;
  const mm = (value: number) => `${(value * u).toFixed(2)}mm`;
  const showHeader = (show.logo && business.logo !== null) || show.businessName;
  const showCodes = (show.barcode && product.barcode !== null) || show.qr;
  // Lo que queda para los códigos: si no hay códigos, el nombre puede usar más líneas.
  const qrSize = Math.min(spec.height * 0.5, spec.width * 0.34);

  return (
    <div
      className="product-label"
      style={{
        boxSizing: 'border-box',
        width: `${spec.width}mm`,
        height: `${spec.height}mm`,
        padding: mm(1.6),
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: mm(0.8),
        background: '#fff',
        color: '#000',
        fontFamily: 'Arial, Helvetica, sans-serif',
        lineHeight: 1.15,
        // Fijo: en la vista previa no hereda el centrado del recuadro de la pantalla.
        textAlign: 'left',
      }}
    >
      {showHeader ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: mm(1.2), minHeight: 0 }}>
          {show.logo && business.logo !== null ? (
            <img
              src={business.logo}
              alt=""
              style={{ height: mm(5), maxWidth: mm(14), objectFit: 'contain' }}
            />
          ) : null}
          {show.businessName ? (
            <span style={{ ...oneLine, fontSize: mm(2.3), fontWeight: 700 }}>{business.name}</span>
          ) : null}
        </div>
      ) : null}

      {show.productName ? (
        <strong style={{ ...lines(showCodes ? 2 : 3), fontSize: mm(3.1) }}>{product.name}</strong>
      ) : null}

      {show.code || show.price ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: mm(1),
          }}
        >
          {show.code ? <span style={{ ...oneLine, fontSize: mm(2.3) }}>{product.code}</span> : null}
          {show.price ? (
            <strong style={{ fontSize: mm(4), whiteSpace: 'nowrap', marginLeft: 'auto' }}>
              {formatMoney(product.price)}
            </strong>
          ) : null}
        </div>
      ) : null}

      {showCodes ? (
        <div
          style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'stretch', gap: mm(1.2) }}
        >
          {show.barcode && product.barcode !== null ? (
            <div
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: mm(0.4),
              }}
            >
              <Ean13Bars barcode={product.barcode} />
              {/* Los números primero reservan su línea; las barras usan lo que sobra. */}
              <span
                style={{
                  flex: '0 0 auto',
                  fontSize: mm(2),
                  lineHeight: 1,
                  letterSpacing: '0.08em',
                  textAlign: 'center',
                }}
              >
                {product.barcode}
              </span>
            </div>
          ) : null}
          {show.qr ? (
            <QRCodeSVG
              value={qrValueOf(product)}
              level="M"
              marginSize={0}
              style={{
                height: '100%',
                maxHeight: `${qrSize}mm`,
                width: 'auto',
                aspectRatio: '1 / 1',
                marginLeft: 'auto',
              }}
              title={`QR de ${product.name}`}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Barras del EAN-13 que se estiran a lo que mida su caja (`preserveAspectRatio="none"`):
 * así llenan el ancho de cualquier etiqueta. El lector solo necesita que las
 * barras guarden su proporción a lo ANCHO, que es lo que se mantiene.
 */
function Ean13Bars({ barcode }: { barcode: string }) {
  const modules = ean13Modules(barcode);

  return (
    <svg
      viewBox={`0 0 ${modules.length + 18} 50`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Código de barras ${barcode}`}
      style={{ flex: '1 1 0', minHeight: 0, width: '100%' }}
    >
      <rect width={modules.length + 18} height="50" fill="#fff" />
      {[...modules].map((module, index) =>
        module === '1' ? <rect key={index} x={index + 9} y="0" width="1" height="50" /> : null,
      )}
    </svg>
  );
}

/** Una sola línea con «…» si no cabe. */
const oneLine: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

/** Hasta `count` líneas con «…» al final. */
function lines(count: number): CSSProperties {
  return {
    display: '-webkit-box',
    WebkitLineClamp: count,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    wordBreak: 'break-word',
  };
}
