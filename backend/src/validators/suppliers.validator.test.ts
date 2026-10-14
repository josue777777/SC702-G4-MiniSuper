import { describe, expect, it } from 'vitest';
import { supplierSchema } from './suppliers.validator.js';

/** Pruebas del esquema de proveedor (HU-21). */

const PRODUCT_UUID = '55555555-5555-4555-8555-555555555555';

function validPayload(): Record<string, unknown> {
  return {
    name: '  Lácteos del Valle ',
    contactName: 'María',
    phone: '8888-1111',
    email: '',
    products: [{ productId: PRODUCT_UUID, unitCost: 700 }],
  };
}

function messages(payload: unknown): string[] {
  const result = supplierSchema.safeParse(payload);

  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('supplierSchema', () => {
  it('acepta el proveedor, recorta el nombre, vacía lo opcional y normaliza el costo', () => {
    expect(supplierSchema.parse(validPayload())).toEqual({
      name: 'Lácteos del Valle',
      contactName: 'María',
      phone: '8888-1111',
      email: null,
      address: null,
      notes: null,
      products: [{ productId: PRODUCT_UUID, unitCost: '700.00' }],
    });
  });

  it('no permite guardar un proveedor sin nombre', () => {
    expect(messages({ ...validPayload(), name: '   ' })).toEqual([
      'El nombre del proveedor es obligatorio.',
    ]);
  });

  it('exige al menos un dato de contacto (teléfono o correo)', () => {
    expect(messages({ ...validPayload(), phone: '', email: null })).toEqual([
      'Indique al menos un dato de contacto: teléfono o correo.',
    ]);
    expect(
      supplierSchema.safeParse({ ...validPayload(), phone: null, email: 'ventas@valle.cr' })
        .success,
    ).toBe(true);
  });

  it('rechaza un correo inválido', () => {
    expect(messages({ ...validPayload(), email: 'no-es-correo' })).toEqual([
      'El correo no es válido.',
    ]);
  });

  it('exige al menos un producto, sin repetidos y con costo válido', () => {
    expect(messages({ ...validPayload(), products: [] })).toEqual([
      'Asocie al menos un producto que suministre el proveedor.',
    ]);
    expect(
      messages({
        ...validPayload(),
        products: [
          { productId: PRODUCT_UUID, unitCost: 700 },
          { productId: PRODUCT_UUID, unitCost: 650 },
        ],
      }),
    ).toEqual(['El producto está repetido en la lista.']);
    expect(
      messages({ ...validPayload(), products: [{ productId: PRODUCT_UUID, unitCost: -5 }] }),
    ).toEqual(['El costo unitario no puede ser negativo.']);
  });
});
