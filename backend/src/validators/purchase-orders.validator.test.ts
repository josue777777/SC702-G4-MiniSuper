import { describe, expect, it } from 'vitest';
import {
  createPurchaseOrderSchema,
  listPurchaseOrdersQuerySchema,
} from './purchase-orders.validator.js';

/** Pruebas de los esquemas de pedidos a proveedor (HU-22, HU-24). */

const SUPPLIER = '66666666-6666-4666-8666-666666666666';
const PRODUCT = '77777777-1111-4111-8111-111111111111';

function messages(payload: unknown): string[] {
  const result = createPurchaseOrderSchema.safeParse(payload);

  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('createPurchaseOrderSchema (HU-24)', () => {
  it('acepta proveedor y productos con cantidad, y vacía las notas en blanco', () => {
    expect(
      createPurchaseOrderSchema.parse({
        supplierId: SUPPLIER,
        notes: '  ',
        items: [{ productId: PRODUCT, quantity: 12 }],
      }),
    ).toEqual({ supplierId: SUPPLIER, notes: null, items: [{ productId: PRODUCT, quantity: 12 }] });
  });

  it('no permite generar un pedido sin productos', () => {
    expect(messages({ supplierId: SUPPLIER, items: [] })).toEqual([
      'Agregue al menos un producto al pedido.',
    ]);
  });

  it('rechaza cantidades en cero, negativas o con decimales', () => {
    for (const quantity of [0, -3, 1.5]) {
      expect(
        createPurchaseOrderSchema.safeParse({
          supplierId: SUPPLIER,
          items: [{ productId: PRODUCT, quantity }],
        }).success,
      ).toBe(false);
    }
  });

  it('rechaza un producto repetido', () => {
    expect(
      messages({
        supplierId: SUPPLIER,
        items: [
          { productId: PRODUCT, quantity: 1 },
          { productId: PRODUCT, quantity: 2 },
        ],
      }),
    ).toEqual(['El producto está repetido en el pedido.']);
  });
});

describe('listPurchaseOrdersQuerySchema (HU-22)', () => {
  it('el filtro por proveedor es opcional y debe ser un id válido', () => {
    expect(listPurchaseOrdersQuerySchema.parse({})).toEqual({});
    expect(listPurchaseOrdersQuerySchema.safeParse({ supplierId: 'x' }).success).toBe(false);
  });
});
