import type { LabelDesign } from '../../types/labels';
import { LABEL_SIZE_SPECS } from './label-sizes';
import { ProductLabel, type LabelBusiness, type LabelProduct } from './ProductLabel';

/** Píxeles de pantalla por milímetro (CSS: 96 px por pulgada, 25,4 mm por pulgada). */
const PX_PER_MM = 96 / 25.4;

interface LabelPreviewProps {
  product: LabelProduct;
  design: LabelDesign;
  business: LabelBusiness;
  /** Ancho máximo que puede ocupar en pantalla, en px. */
  maxWidth?: number;
}

/**
 * La etiqueta agrandada para verla en pantalla. Se dibuja en milímetros reales
 * y se escala con `transform`, así lo que se ve es exactamente lo que se imprime.
 *
 * @example una etiqueta de 50 mm mide 189 px; con `maxWidth` 320 se agranda × 1,69.
 */
export function LabelPreview({ product, design, business, maxWidth = 320 }: LabelPreviewProps) {
  const spec = LABEL_SIZE_SPECS[design.size];
  const width = spec.width * PX_PER_MM;
  const height = spec.height * PX_PER_MM;
  const scale = Math.min(2.5, maxWidth / width);

  return (
    <figure
      className="label-preview"
      style={{ margin: 0 }}
      aria-label="Vista previa de la etiqueta"
    >
      <div style={{ width: width * scale, height: height * scale }}>
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            width,
            height,
            outline: '1px dashed var(--color-border)',
          }}
        >
          <ProductLabel product={product} design={design} spec={spec} business={business} />
        </div>
      </div>
      <figcaption className="muted">{spec.name} · tamaño real en la impresión</figcaption>
    </figure>
  );
}
