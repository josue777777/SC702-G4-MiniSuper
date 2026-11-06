/**
 * Tipos del diseño de etiquetas de productos (HU-07), iguales a los del backend
 * (`backend/src/validators/label-design.validator.ts`).
 */

/** Tamaños: rollo térmico (una etiqueta por sticker) u hoja carta de stickers. */
export type LabelSize = 'roll-50x25' | 'roll-58x40' | 'roll-100x50' | 'letter-30' | 'letter-10';

/** Datos que se pueden encender o apagar en la etiqueta. */
export type LabelField =
  'logo' | 'businessName' | 'productName' | 'code' | 'price' | 'barcode' | 'qr';

/** Diseño del negocio: uno solo, lo define el Encargado y todos imprimen igual. */
export interface LabelDesign {
  size: LabelSize;
  show: Record<LabelField, boolean>;
}

/** Una línea a imprimir: qué producto y cuántas etiquetas de él. */
export interface LabelRequest {
  productId: string;
  quantity: number;
}
