import { LETTER_SHEET, type LabelSizeSpec } from './label-sizes';

/** Id del marco escondido donde se arma la impresión (las pruebas E2E lo leen). */
export const LABEL_PRINT_FRAME_ID = 'label-print-frame';

/**
 * Imprime las etiquetas ya dibujadas en `sheet` (ver `LabelSheet`), sin abrir
 * otra ventana: usa un `<iframe>` escondido. Así el navegador no lo bloquea como
 * ventana emergente y la impresión no arrastra el menú ni la pantalla de atrás.
 *
 * `@page` le dice a la impresora el tamaño exacto del papel: el del sticker en
 * rollo (58 × 40 mm) o la hoja carta, sin márgenes (los márgenes ya vienen en la
 * posición de cada etiqueta).
 *
 * @param sheet El contenedor con las páginas dibujadas.
 * @param spec Tamaño elegido.
 * @returns Cuando el diálogo de impresión ya se abrió.
 */
export async function printLabels(sheet: HTMLElement, spec: LabelSizeSpec): Promise<void> {
  const page = spec.kind === 'sheet' ? LETTER_SHEET : spec;
  const frame = labelFrame();
  const doc = frame.contentDocument;
  const view = frame.contentWindow;

  if (doc === null || view === null) {
    throw new Error('El navegador no permitió preparar la impresión.');
  }

  doc.open();
  doc.write(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas</title><style>` +
      `@page{size:${page.width}mm ${page.height}mm;margin:0}` +
      'html,body{margin:0;padding:0;background:#fff}' +
      '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '.label-page{break-after:page;page-break-after:always}' +
      '.label-page:last-child{break-after:auto;page-break-after:auto}' +
      `</style></head><body>${sheet.innerHTML}</body></html>`,
  );
  doc.close();

  // El logo es una imagen: se espera a que esté lista para que no salga en blanco.
  await Promise.all([...doc.images].map((image) => image.decode().catch(() => undefined)));
  view.focus();
  view.print();
}

/** Quita el marco de impresión (al cerrar la ventana de etiquetas). */
export function removeLabelFrame(): void {
  document.getElementById(LABEL_PRINT_FRAME_ID)?.remove();
}

/** El marco escondido; se reutiliza entre impresiones. */
function labelFrame(): HTMLIFrameElement {
  const existing = document.getElementById(LABEL_PRINT_FRAME_ID);

  if (existing instanceof HTMLIFrameElement) {
    return existing;
  }

  const frame = document.createElement('iframe');

  frame.id = LABEL_PRINT_FRAME_ID;
  frame.title = 'Impresión de etiquetas';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  // Fuera de la vista pero con tamaño real: algunos navegadores no imprimen un marco de 0 × 0.
  Object.assign(frame.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '400px',
    height: '400px',
    border: '0',
  });
  document.body.appendChild(frame);

  return frame;
}
