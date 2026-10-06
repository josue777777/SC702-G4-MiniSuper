import { describe, expect, it } from 'vitest';
import { createInventoryCountSchema } from './inventory.validator.js';

/**
 * Pruebas del esquema Zod del conteo de inventario físico (HU-10).
 *
 * El caso que la historia pide expresamente es el de la cantidad negativa: se
 * rechaza con un mensaje que pide corregirla.
 */

const PRODUCT_UUID = '11111111-1111-4111-8111-111111111111';

/** Mensajes de error del esquema para un payload dado. */
function issueMessages(payload: unknown): string[] {
  const result = createInventoryCountSchema.safeParse(payload);

  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('createInventoryCountSchema', () => {
  it('acepta el producto y la cantidad contada', () => {
    expect(
      createInventoryCountSchema.parse({ productId: PRODUCT_UUID, countedQuantity: 8 }),
    ).toEqual({ productId: PRODUCT_UUID, countedQuantity: 8 });
  });

  it('acepta un conteo de cero (el producto se agotó)', () => {
    expect(
      createInventoryCountSchema.parse({ productId: PRODUCT_UUID, countedQuantity: 0 })
        .countedQuantity,
    ).toBe(0);
  });

  it('rechaza una cantidad contada negativa y pide corregirla', () => {
    expect(issueMessages({ productId: PRODUCT_UUID, countedQuantity: -1 })).toEqual([
      'La cantidad contada no puede ser negativa. Corríjala e intente de nuevo.',
    ]);
  });

  it('rechaza decimales y texto en la cantidad contada', () => {
    expect(issueMessages({ productId: PRODUCT_UUID, countedQuantity: 2.5 })).toEqual([
      'La cantidad contada debe ser un número entero.',
    ]);
    expect(issueMessages({ productId: PRODUCT_UUID, countedQuantity: '8' })).toEqual([
      'La cantidad contada debe ser un número.',
    ]);
  });

  it('exige un producto válido', () => {
    expect(issueMessages({ countedQuantity: 8 })).toEqual(['Debe seleccionar un producto.']);
    expect(issueMessages({ productId: 'abc', countedQuantity: 8 })).toEqual([
      'Debe seleccionar un producto.',
    ]);
  });
});
