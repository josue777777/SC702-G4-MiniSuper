import { z } from 'zod';

/**
 * Diseño de la etiqueta de productos del negocio (HU-07: el código se puede
 * imprimir). Es UNO por negocio: lo define el Encargado y todos imprimen igual,
 * porque es el rotulado de la empresa.
 *
 * Aquí solo se valida QUÉ lleva la etiqueta y su tamaño; las medidas en
 * milímetros de cada tamaño viven en el frontend (`features/labels/label-sizes.ts`),
 * que es quien dibuja e imprime.
 */

/**
 * Tamaños disponibles:
 *   - rollo térmico (una etiqueta por sticker): 50 × 25, 58 × 40 y 100 × 50 mm;
 *   - hoja carta de stickers: 30 por hoja (66,7 × 25,4 mm) o 10 por hoja
 *     (101,6 × 50,8 mm), las medidas de las hojas de etiquetas más comunes.
 */
export const LABEL_SIZES = [
  'roll-50x25',
  'roll-58x40',
  'roll-100x50',
  'letter-30',
  'letter-10',
] as const;

export type LabelSize = (typeof LABEL_SIZES)[number];

/** Datos que se pueden encender o apagar en la etiqueta. */
export const LABEL_FIELDS = [
  'logo',
  'businessName',
  'productName',
  'code',
  'price',
  'barcode',
  'qr',
] as const;

export type LabelField = (typeof LABEL_FIELDS)[number];

/** Al menos uno de estos tiene que verse: sin ellos no se sabe qué producto es. */
const IDENTIFYING_FIELDS: readonly LabelField[] = ['productName', 'code', 'barcode', 'qr'];

const showSchema = z.strictObject(
  Object.fromEntries(
    LABEL_FIELDS.map((field) => [field, z.boolean({ error: 'Indique sí o no.' })]),
  ) as Record<LabelField, z.ZodBoolean>,
  { error: 'Indique qué datos lleva la etiqueta.' },
);

/** Cuerpo de `PUT /api/business/label-design` (y lo que devuelve el `GET`). */
export const labelDesignSchema = z
  .strictObject(
    {
      size: z.enum(LABEL_SIZES, { error: 'Elija un tamaño de etiqueta de la lista.' }),
      show: showSchema,
    },
    { error: 'Envíe el diseño de la etiqueta.' },
  )
  .refine((design) => IDENTIFYING_FIELDS.some((field) => design.show[field]), {
    message:
      'La etiqueta debe identificar el producto: muestre al menos el nombre, el código, el código de barras o el QR.',
    path: ['show'],
  });

export type LabelDesign = z.infer<typeof labelDesignSchema>;

/** Diseño de fábrica: rollo de 58 × 40 mm con todos los datos. */
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

/**
 * Diseño guardado → diseño válido. Lo que falte (un dato nuevo que se agregue
 * más adelante) toma el valor de fábrica; si lo guardado ya no es válido, se usa
 * el de fábrica completo. Así una etiqueta nunca deja de imprimirse.
 *
 * @param stored Lo que hay en la columna `Business.labelDesign` (`null` si nunca se guardó).
 * @returns Siempre un diseño válido.
 * @example labelDesignOf(null) // DEFAULT_LABEL_DESIGN
 * @example labelDesignOf({ size: 'letter-30', show: { price: false } })
 *   // { size: 'letter-30', show: { ...DEFAULT_LABEL_DESIGN.show, price: false } }
 */
export function labelDesignOf(stored: unknown): LabelDesign {
  if (typeof stored !== 'object' || stored === null) {
    return DEFAULT_LABEL_DESIGN;
  }

  const partial = stored as { size?: unknown; show?: unknown };
  const show = typeof partial.show === 'object' && partial.show !== null ? partial.show : {};
  const merged = labelDesignSchema.safeParse({
    size: partial.size ?? DEFAULT_LABEL_DESIGN.size,
    show: { ...DEFAULT_LABEL_DESIGN.show, ...pickKnown(show) },
  });

  return merged.success ? merged.data : DEFAULT_LABEL_DESIGN;
}

/** Solo los datos conocidos: uno que se haya quitado no rompe el esquema estricto. */
function pickKnown(show: object): Partial<Record<LabelField, unknown>> {
  return Object.fromEntries(
    Object.entries(show).filter(([key]) => (LABEL_FIELDS as readonly string[]).includes(key)),
  );
}
