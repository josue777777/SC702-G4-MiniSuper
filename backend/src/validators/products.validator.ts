import { z } from 'zod';
import type { ProductWritableFields } from '../types/products.js';

/**
 * Esquemas Zod del recurso productos (HU-01, HU-02).
 *
 * Son la fuente de verdad de lo que acepta la API: el frontend valida también,
 * pero solo para dar mejor experiencia; quien decide es este archivo. Un
 * incumplimiento se convierte en `400` con el detalle por campo (ver
 * `middleware/error-handler.middleware.ts`).
 */

/** Valor máximo que admite la columna `Decimal(12, 2)`. */
const MAX_MONEY = 9_999_999_999.99;

/** Tope de stock: evita desbordar la columna `Int` con un valor absurdo. */
const MAX_STOCK = 1_000_000;

/** `true` si el número tiene como máximo dos decimales (la precisión de la columna). */
function hasAtMostTwoDecimals(value: number): boolean {
  return Number.isInteger(Number((value * 100).toFixed(4)));
}

/**
 * Importe monetario.
 *
 * Acepta número o cadena (`"1500.00"`) y devuelve siempre la forma canónica de
 * dos decimales. Rechaza lo que rompería la columna o el cálculo: cadena vacía,
 * `NaN`, `Infinity`, negativos, más de dos decimales y valores fuera de rango.
 */
function moneySchema(label: string) {
  return z
    .union([z.number(), z.string()], { error: `${label} es obligatorio.` })
    .transform((value, ctx) => {
      if (typeof value === 'string' && value.trim() === '') {
        ctx.addIssue({ code: 'custom', message: `${label} es obligatorio.` });
        return z.NEVER;
      }

      const parsed = typeof value === 'number' ? value : Number(value.trim());

      if (!Number.isFinite(parsed)) {
        ctx.addIssue({ code: 'custom', message: `${label} debe ser un número válido.` });
        return z.NEVER;
      }

      if (parsed < 0) {
        ctx.addIssue({ code: 'custom', message: `${label} no puede ser negativo.` });
        return z.NEVER;
      }

      if (parsed > MAX_MONEY) {
        ctx.addIssue({
          code: 'custom',
          message: `${label} supera el máximo permitido (${MAX_MONEY.toFixed(2)}).`,
        });
        return z.NEVER;
      }

      if (!hasAtMostTwoDecimals(parsed)) {
        ctx.addIssue({ code: 'custom', message: `${label} admite máximo dos decimales.` });
        return z.NEVER;
      }

      return parsed.toFixed(2);
    });
}

const codeSchema = z
  .string({ error: 'El código es obligatorio.' })
  .trim()
  .min(1, 'El código no puede estar vacío.')
  .max(50, 'El código no puede superar 50 caracteres.');

const nameSchema = z
  .string({ error: 'El nombre es obligatorio.' })
  .trim()
  .min(1, 'El nombre no puede estar vacío.')
  .max(120, 'El nombre no puede superar 120 caracteres.');

const categoryIdSchema = z.uuid({ error: 'Debe seleccionar una categoría.' });

const supplierIdSchema = z.uuid({ error: 'Debe seleccionar un proveedor.' });

const stockSchema = z
  .number({ error: 'El stock debe ser un número.' })
  .int('El stock debe ser un número entero.')
  .min(0, 'El stock no puede ser negativo.')
  .max(MAX_STOCK, `El stock no puede superar ${MAX_STOCK}.`);

/** Cuerpo de `POST /api/products` (HU-01). */
export const createProductSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  categoryId: categoryIdSchema,
  price: moneySchema('El precio'),
  cost: moneySchema('El costo'),
  stock: stockSchema,
  supplierId: supplierIdSchema,
});

/**
 * Cuerpo de `PATCH /api/products/:id` (HU-02).
 *
 * HU-02 permite modificar todos los campos del producto, así que el formulario
 * de edición envía el conjunto completo, igual que el de creación. Se exige el
 * cuerpo completo a propósito: con campos parciales no se puede distinguir
 * "no cambiar el stock" de "dejar el stock en cero".
 */
export const updateProductSchema = createProductSchema;

/** Parámetro `:id` de las rutas de detalle. */
export const productIdParamSchema = z.object({
  id: z.uuid({ error: 'El producto indicado no es válido.' }),
});

/** Entrada ya validada y normalizada de la creación. */
export type CreateProductInput = z.infer<typeof createProductSchema>;

/** Entrada ya validada y normalizada de la edición. */
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/**
 * Comprobación en tiempo de compilación: si el esquema y el contrato declarado
 * en `types/products.ts` se separan, `npm run typecheck` falla y lo avisa. Las
 * dos direcciones importan, porque un campo de más también es una divergencia.
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const _contractCheck: Exact<CreateProductInput, ProductWritableFields> = true;
