import type { LabelDesign } from '../../types/labels';
import { LETTER_SHEET, paginateLabels, slotPosition, type LabelSizeSpec } from './label-sizes';
import { ProductLabel, type LabelBusiness, type LabelProduct } from './ProductLabel';

interface LabelSheetProps {
  /** Una entrada por etiqueta, en orden (ver `expandLabels`). */
  labels: readonly LabelProduct[];
  design: LabelDesign;
  spec: LabelSizeSpec;
  business: LabelBusiness;
  /** En hojas ya usadas: posición de la primera etiqueta (1 = la primera). */
  startAt: number;
}

/**
 * Las páginas tal como salen de la impresora (HU-07). No se ve en pantalla: la
 * pantalla la dibuja escondida y `printLabels` copia su HTML a la impresión.
 *
 *   - Rollo: una página por etiqueta, del tamaño del sticker.
 *   - Hoja carta: cada etiqueta en su casilla, medida desde la esquina de la hoja.
 */
export function LabelSheet({ labels, design, spec, business, startAt }: LabelSheetProps) {
  const pages = paginateLabels(labels, spec, startAt);
  const page = spec.kind === 'sheet' ? LETTER_SHEET : spec;

  return (
    <>
      {pages.map((slots, pageIndex) => (
        <section
          key={pageIndex}
          className="label-page"
          style={{
            position: 'relative',
            width: `${page.width}mm`,
            height: `${page.height}mm`,
            overflow: 'hidden',
          }}
        >
          {slots.map((product, slotIndex) => {
            if (product === null) {
              return null;
            }

            const { left, top } = slotPosition(spec, slotIndex);

            return (
              <div
                key={slotIndex}
                style={{ position: 'absolute', left: `${left}mm`, top: `${top}mm` }}
              >
                <ProductLabel product={product} design={design} spec={spec} business={business} />
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}
