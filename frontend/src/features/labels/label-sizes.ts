import type { LabelDesign, LabelField, LabelRequest, LabelSize } from '../../types/labels';

/**
 * Medidas y cuentas de las etiquetas de productos (HU-07), sin React.
 *
 * Todo se mide en MILÍMETROS porque así se venden las etiquetas (rollo de
 * 58 × 40 mm, hoja carta de 30). El navegador imprime los milímetros tal cual
 * con CSS (`@page { size: 58mm 40mm }`), así la etiqueta cae justo en el sticker.
 */

/** Hoja carta: 8,5 × 11 pulgadas. */
export const LETTER_SHEET = { width: 215.9, height: 279.4 } as const;

/** Cómo se acomodan las etiquetas en una hoja de stickers (en mm). */
export interface SheetGrid {
  columns: number;
  rows: number;
  /** Margen superior e izquierdo de la hoja hasta la primera etiqueta. */
  marginTop: number;
  marginLeft: number;
  /** Separación entre columnas y entre filas. */
  gapX: number;
  gapY: number;
}

export interface LabelSizeSpec {
  id: LabelSize;
  /** Cómo se ve en la lista, por ejemplo «Rollo 58 × 40 mm». */
  name: string;
  /** `roll`: una etiqueta por sticker (impresora térmica); `sheet`: hoja carta. */
  kind: 'roll' | 'sheet';
  /** Tamaño de UNA etiqueta. */
  width: number;
  height: number;
  /** Solo en hojas: cuántas caben y dónde. */
  sheet?: SheetGrid;
}

/**
 * Los tamaños que ofrece la pantalla. Las hojas usan las medidas de las hojas
 * de etiquetas más comunes en papelerías:
 *   - 30 por hoja: 3 columnas × 10 filas de 66,7 × 25,4 mm;
 *   - 10 por hoja: 2 columnas × 5 filas de 101,6 × 50,8 mm.
 */
export const LABEL_SIZE_SPECS: Record<LabelSize, LabelSizeSpec> = {
  'roll-50x25': { id: 'roll-50x25', name: 'Rollo 50 × 25 mm', kind: 'roll', width: 50, height: 25 },
  'roll-58x40': { id: 'roll-58x40', name: 'Rollo 58 × 40 mm', kind: 'roll', width: 58, height: 40 },
  'roll-100x50': {
    id: 'roll-100x50',
    name: 'Rollo 100 × 50 mm',
    kind: 'roll',
    width: 100,
    height: 50,
  },
  'letter-30': {
    id: 'letter-30',
    name: 'Hoja carta · 30 por hoja (66,7 × 25,4 mm)',
    kind: 'sheet',
    width: 66.7,
    height: 25.4,
    sheet: { columns: 3, rows: 10, marginTop: 12.7, marginLeft: 4.8, gapX: 3.15, gapY: 0 },
  },
  'letter-10': {
    id: 'letter-10',
    name: 'Hoja carta · 10 por hoja (101,6 × 50,8 mm)',
    kind: 'sheet',
    width: 101.6,
    height: 50.8,
    sheet: { columns: 2, rows: 5, marginTop: 12.7, marginLeft: 3.97, gapX: 4.76, gapY: 0 },
  },
};

/** Orden en que se muestran los tamaños: primero los rollos, luego las hojas. */
export const LABEL_SIZE_ORDER: LabelSize[] = [
  'roll-50x25',
  'roll-58x40',
  'roll-100x50',
  'letter-30',
  'letter-10',
];

/** Nombre de cada dato en la pantalla, en el orden en que aparecen en la etiqueta. */
export const LABEL_FIELD_LABELS: Record<LabelField, string> = {
  logo: 'Logo del negocio',
  businessName: 'Nombre del negocio',
  productName: 'Nombre del producto',
  code: 'Código del producto',
  price: 'Precio de venta',
  barcode: 'Código de barras',
  qr: 'Código QR',
};

export const LABEL_FIELD_ORDER = Object.keys(LABEL_FIELD_LABELS) as LabelField[];

/** Igual que el diseño de fábrica del backend: rollo de 58 × 40 mm con todo. */
export const DEFAULT_LABEL_DESIGN: LabelDesign = {
  size: 'roll-58x40',
  show: {
    logo: true,
    businessName: true,
    productName: true,
    code: true,
    price: true,
    barcode: true,
    qr: true,
  },
};

/** Ejemplo para la vista previa cuando todavía no se eligió ningún producto. */
export const SAMPLE_PRODUCT = {
  code: 'ARR-01',
  name: 'Arroz blanco 1 kg',
  price: '1350.00',
  barcode: '7501234567893',
};

/**
 * Tope de etiquetas por impresión: más que esto congela el navegador y casi
 * nunca es lo que se quiso (por ejemplo, un 0 de más en la cantidad).
 */
export const MAX_LABELS_PER_PRINT = 1000;

/** Tope de copias de un mismo producto. */
export const MAX_COPIES = 500;

/**
 * ¿La etiqueta permite saber qué producto es? Igual que la regla del backend.
 *
 * @example identifiesProduct({ ...todoApagado, price: true }) // false: solo el precio no dice qué es
 */
export function identifiesProduct(show: LabelDesign['show']): boolean {
  return show.productName || show.code || show.barcode || show.qr;
}

/**
 * Cuántas etiquetas caben en una página: en rollo, una; en hoja, columnas × filas.
 *
 * @example labelsPerPage(LABEL_SIZE_SPECS['letter-30']) // 3 × 10 = 30
 * @example labelsPerPage(LABEL_SIZE_SPECS['roll-58x40']) // 1
 */
export function labelsPerPage(spec: LabelSizeSpec): number {
  return spec.sheet === undefined ? 1 : spec.sheet.columns * spec.sheet.rows;
}

/**
 * Total de etiquetas pedidas (la suma de las cantidades).
 *
 * @example totalLabels([{ productId: 'a', quantity: 12 }, { productId: 'b', quantity: 3 }]) // 15
 */
export function totalLabels(requests: readonly LabelRequest[]): number {
  return requests.reduce((sum, request) => sum + Math.max(0, request.quantity), 0);
}

/**
 * Repite cada producto tantas veces como etiquetas se pidieron, en orden.
 * Los productos que ya no existen se saltan.
 *
 * @param requests Lo que se eligió imprimir.
 * @param byId Los productos cargados, por id.
 * @returns Una entrada por etiqueta.
 * @example expandLabels([{ productId: 'cafe', quantity: 2 }, { productId: 'pan', quantity: 1 }], …)
 *   // [café, café, pan]
 */
export function expandLabels<T>(
  requests: readonly LabelRequest[],
  byId: ReadonlyMap<string, T>,
): T[] {
  return requests.flatMap((request) => {
    const product = byId.get(request.productId);

    return product === undefined
      ? []
      : Array.from({ length: Math.max(0, request.quantity) }, () => product);
  });
}

/**
 * Reparte las etiquetas en páginas. En una hoja de stickers ya usada se puede
 * empezar en la posición `startAt` (contando de izquierda a derecha y de arriba
 * abajo): las anteriores quedan vacías (`null`) para no imprimir encima.
 *
 * @param labels Una entrada por etiqueta (ver `expandLabels`).
 * @param spec Tamaño elegido.
 * @param startAt Posición de la primera etiqueta en la primera hoja (1 = la primera).
 * @returns Las páginas; cada una con sus posiciones en orden.
 * @example paginateLabels(32 etiquetas, hoja de 30, 5)
 *   // hoja 1: 4 vacías + 26 etiquetas; hoja 2: las 6 que faltan
 */
export function paginateLabels<T>(
  labels: readonly T[],
  spec: LabelSizeSpec,
  startAt = 1,
): (T | null)[][] {
  const perPage = labelsPerPage(spec);
  const skipped = spec.kind === 'sheet' ? clampStart(startAt, perPage) - 1 : 0;
  const slots: (T | null)[] = [...Array.from({ length: skipped }, () => null), ...labels];
  const pages: (T | null)[][] = [];

  for (let start = 0; start < slots.length; start += perPage) {
    pages.push(slots.slice(start, start + perPage));
  }

  return pages;
}

/**
 * Posición donde arranca una etiqueta en la hoja, en mm desde la esquina
 * superior izquierda.
 *
 * @param grid Acomodo de la hoja.
 * @param index Posición en la hoja, desde 0.
 * @example slotPosition(hoja de 30, 4) // columna 2, fila 2: { left: 4,8 + 66,7 + 3,15, top: 12,7 + 25,4 }
 */
export function slotPosition(spec: LabelSizeSpec, index: number): { left: number; top: number } {
  const grid = spec.sheet;

  if (grid === undefined) {
    return { left: 0, top: 0 };
  }

  const column = index % grid.columns;
  const row = Math.floor(index / grid.columns);

  return {
    left: grid.marginLeft + column * (spec.width + grid.gapX),
    top: grid.marginTop + row * (spec.height + grid.gapY),
  };
}

/** La posición inicial siempre cae dentro de la hoja: de 1 a las que caben. */
export function clampStart(startAt: number, perPage: number): number {
  return Number.isInteger(startAt) ? Math.min(Math.max(1, startAt), perPage) : 1;
}

/**
 * Lo que guarda el QR: el código de barras si el producto lo tiene (así el
 * lector de la caja lo reconoce igual) y si no, su código interno. Es la misma
 * regla del formulario del producto.
 *
 * @example qrValueOf({ barcode: '7501234567893', code: 'ARR-01' }) // '7501234567893'
 * @example qrValueOf({ barcode: null, code: 'PAN-01' }) // 'PAN-01'
 */
export function qrValueOf(product: { barcode: string | null; code: string }): string {
  return product.barcode ?? product.code;
}
