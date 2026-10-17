import { z } from 'zod';
import type { SupplierWritableFields } from '../types/suppliers.js';
import { moneySchema } from './products.validator.js';

/**
 * Esquemas Zod del recurso proveedores (HU-21).
 *
 * HU-21 exige el nombre y al menos un dato de contacto. Como dato de contacto
 * se aceptan el teléfono o el correo: son los que permiten comunicarse con el
 * proveedor para hacerle un pedido.
 */

/** Convierte "" o solo espacios en `null`, para que un campo vacío signifique "sin dato". */
function optionalText(max: number, label: string) {
  return z
    .string({ error: `${label} debe ser texto.` })
    .trim()
    .max(max, `${label} no puede superar ${max} caracteres.`)
    .nullish()
    .transform((value) => (value === undefined || value === null || value === '' ? null : value));
}

const supplierProductSchema = z.object({
  productId: z.uuid({ error: 'Seleccione un producto válido.' }),
  unitCost: moneySchema('El costo unitario'),
});

/** Cuerpo de `POST /api/suppliers` y `PATCH /api/suppliers/:id` (HU-21). */
export const supplierSchema = z
  .object({
    name: z
      .string({ error: 'El nombre del proveedor es obligatorio.' })
      .trim()
      .min(1, 'El nombre del proveedor es obligatorio.')
      .max(120, 'El nombre no puede superar 120 caracteres.'),
    contactName: optionalText(120, 'El nombre de contacto'),
    phone: optionalText(30, 'El teléfono'),
    email: optionalText(120, 'El correo').pipe(
      z.email({ error: 'El correo no es válido.' }).nullable(),
    ),
    address: optionalText(250, 'La dirección'),
    notes: optionalText(500, 'Las notas'),
    /*
     * Puede registrarse sin productos: un producto exige proveedor (HU-01), así
     * que con la base vacía el primer proveedor tiene que poder existir antes.
     * Los productos se le asocian después, al editarlo o al registrar productos.
     */
    products: z.array(supplierProductSchema, {
      error: 'Indique los productos que suministra.',
    }),
  })
  .superRefine((value, ctx) => {
    if (value.phone === null && value.email === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['phone'],
        message: 'Indique al menos un dato de contacto: teléfono o correo.',
      });
    }

    const seen = new Set<string>();
    value.products.forEach((product, index) => {
      if (seen.has(product.productId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['products', index, 'productId'],
          message: 'El producto está repetido en la lista.',
        });
      }
      seen.add(product.productId);
    });
  });

/** Parámetro `:id` de las rutas de detalle. */
export const supplierIdParamSchema = z.object({
  id: z.uuid({ error: 'El proveedor indicado no es válido.' }),
});

/** Entrada ya validada y normalizada (registro y edición). */
export type SupplierInput = z.infer<typeof supplierSchema>;

/** Comprobación en tiempo de compilación contra `types/suppliers.ts`. */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const _contractCheck: Exact<SupplierInput, SupplierWritableFields> = true;
