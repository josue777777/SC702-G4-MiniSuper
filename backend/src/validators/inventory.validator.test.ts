import { describe, expect, it } from 'vitest';
import {
  createInventoryCountSchema,
  updateExpirationDateSchema,
  updateMinStockSchema,
} from './inventory.validator.js';

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

describe('updateMinStockSchema (HU-08)', () => {
  it('acepta un entero mayor o igual a 0 (0 = sin mínimo)', () => {
    expect(updateMinStockSchema.parse({ minStock: 5 })).toEqual({ minStock: 5 });
    expect(updateMinStockSchema.parse({ minStock: 0 })).toEqual({ minStock: 0 });
  });

  it('rechaza negativos, decimales y texto', () => {
    expect(updateMinStockSchema.safeParse({ minStock: -1 }).success).toBe(false);
    expect(updateMinStockSchema.safeParse({ minStock: 1.5 }).success).toBe(false);
    expect(updateMinStockSchema.safeParse({ minStock: '5' }).success).toBe(false);
  });
});

describe('updateExpirationDateSchema (HU-09)', () => {
  it('acepta una fecha AAAA-MM-DD', () => {
    expect(updateExpirationDateSchema.parse({ expirationDate: '2026-12-31' })).toEqual({
      expirationDate: '2026-12-31',
    });
  });

  it('acepta null: el campo es opcional para productos que no vencen', () => {
    expect(updateExpirationDateSchema.parse({ expirationDate: null })).toEqual({
      expirationDate: null,
    });
  });

  it('rechaza formatos y fechas inválidas', () => {
    expect(updateExpirationDateSchema.safeParse({ expirationDate: '31/12/2026' }).success).toBe(
      false,
    );
    expect(updateExpirationDateSchema.safeParse({ expirationDate: '2026-02-30' }).success).toBe(
      false,
    );
  });
});
