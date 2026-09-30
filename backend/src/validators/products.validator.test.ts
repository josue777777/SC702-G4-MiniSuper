import { describe, expect, it } from 'vitest';
import {
  createProductSchema,
  productIdParamSchema,
  updateProductSchema,
} from './products.validator.js';

/**
 * Pruebas de los esquemas Zod del recurso productos (HU-01, HU-02).
 *
 * Es la frontera donde se decide qué entra: los casos hostiles que la historia
 * pide rechazar (vacíos, texto donde va un número, negativos, decimales de más)
 * se comprueban aquí, sin pasar por HTTP ni por la base de datos.
 */

const CATEGORY_UUID = '22222222-2222-4222-8222-222222222222';
const SUPPLIER_UUID = '33333333-3333-4333-8333-333333333333';

/** Payload válido mínimo de HU-01. */
function validPayload(): Record<string, unknown> {
  return {
    code: 'P001',
    name: 'Café molido 500 g',
    categoryId: CATEGORY_UUID,
    price: '1500.00',
    cost: '1000.00',
    stock: 10,
    supplierId: SUPPLIER_UUID,
  };
}

/** Mensajes de error del esquema de creación para un payload dado. */
function issueMessages(payload: unknown): string[] {
  const result = createProductSchema.safeParse(payload);

  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('createProductSchema', () => {
  it('acepta el cuerpo de HU-01 y normaliza el dinero a dos decimales', () => {
    const parsed = createProductSchema.parse(validPayload());

    expect(parsed).toEqual({
      code: 'P001',
      name: 'Café molido 500 g',
      categoryId: CATEGORY_UUID,
      price: '1500.00',
      cost: '1000.00',
      stock: 10,
      supplierId: SUPPLIER_UUID,
    });
  });

  it('normaliza importes venidos como número o con un decimal', () => {
    expect(createProductSchema.parse({ ...validPayload(), price: 1500 }).price).toBe('1500.00');
    expect(createProductSchema.parse({ ...validPayload(), price: '1500.5' }).price).toBe('1500.50');
  });

  it('recorta los espacios del código y del nombre', () => {
    const parsed = createProductSchema.parse({
      ...validPayload(),
      code: '  P001  ',
      name: '  Café molido  ',
    });

    expect(parsed.code).toBe('P001');
    expect(parsed.name).toBe('Café molido');
  });

  it('exige código y nombre no vacíos', () => {
    expect(issueMessages({ ...validPayload(), code: '   ' })).toContain(
      'El código no puede estar vacío.',
    );
    expect(issueMessages({ ...validPayload(), name: '' })).toContain(
      'El nombre no puede estar vacío.',
    );

    const sinCodigo = validPayload();
    delete sinCodigo['code'];
    expect(issueMessages(sinCodigo)).toContain('El código es obligatorio.');
  });

  it('exige que categoría y proveedor sean identificadores válidos', () => {
    expect(issueMessages({ ...validPayload(), categoryId: 'bebidas' })).toContain(
      'Debe seleccionar una categoría.',
    );
    expect(issueMessages({ ...validPayload(), supplierId: '' })).toContain(
      'Debe seleccionar un proveedor.',
    );
  });

  it('rechaza precios que no son números', () => {
    expect(issueMessages({ ...validPayload(), price: 'abc' })).toContain(
      'El precio debe ser un número válido.',
    );
    expect(issueMessages({ ...validPayload(), price: '   ' })).toContain(
      'El precio es obligatorio.',
    );
    // Zod 4 rechaza NaN e Infinity en `z.number()`, así que los dos caen en el
    // mensaje de campo obligatorio: NaN es lo que produce un input numérico
    // vacío y Infinity no es un monto que el usuario pueda escribir a mano. Una
    // cadena como "Infinity" sí llega al transform y se informa como inválida.
    expect(issueMessages({ ...validPayload(), price: Number.POSITIVE_INFINITY })).toContain(
      'El precio es obligatorio.',
    );
    expect(issueMessages({ ...validPayload(), price: Number.NaN })).toContain(
      'El precio es obligatorio.',
    );
    expect(issueMessages({ ...validPayload(), price: 'Infinity' })).toContain(
      'El precio debe ser un número válido.',
    );
    expect(createProductSchema.safeParse({ ...validPayload(), price: Number.NaN }).success).toBe(
      false,
    );
    expect(
      createProductSchema.safeParse({ ...validPayload(), price: Number.POSITIVE_INFINITY }).success,
    ).toBe(false);
  });

  it('rechaza montos negativos, con demasiados decimales o fuera de rango', () => {
    expect(issueMessages({ ...validPayload(), price: -1 })).toContain(
      'El precio no puede ser negativo.',
    );
    expect(issueMessages({ ...validPayload(), price: 1.999 })).toContain(
      'El precio admite máximo dos decimales.',
    );
    expect(issueMessages({ ...validPayload(), price: 10_000_000_000 })).toContain(
      'El precio supera el máximo permitido (9999999999.99).',
    );
  });

  it('rechaza costos inválidos con el nombre del campo correcto', () => {
    expect(issueMessages({ ...validPayload(), cost: 'n/a' })).toContain(
      'El costo debe ser un número válido.',
    );
    expect(issueMessages({ ...validPayload(), cost: -0.01 })).toContain(
      'El costo no puede ser negativo.',
    );
  });

  it('exige un stock entero y no negativo', () => {
    expect(issueMessages({ ...validPayload(), stock: -1 })).toContain(
      'El stock no puede ser negativo.',
    );
    expect(issueMessages({ ...validPayload(), stock: 1.5 })).toContain(
      'El stock debe ser un número entero.',
    );
    expect(issueMessages({ ...validPayload(), stock: 'diez' })).toContain(
      'El stock debe ser un número.',
    );
    expect(issueMessages({ ...validPayload(), stock: Number.NaN })).toContain(
      'El stock debe ser un número.',
    );
  });

  it('descarta campos que no pertenecen al formulario', () => {
    // Un cliente no debe poder colar isActive, barcode ni otros campos por aquí.
    const parsed = createProductSchema.parse({
      ...validPayload(),
      isActive: false,
      barcode: '7501234567890',
      minStock: 99,
    });

    expect(Object.keys(parsed).sort()).toEqual([
      'categoryId',
      'code',
      'cost',
      'name',
      'price',
      'stock',
      'supplierId',
    ]);
  });
});

describe('updateProductSchema', () => {
  it('valida el mismo cuerpo completo que la creación (HU-02)', () => {
    expect(updateProductSchema.parse({ ...validPayload(), price: '1800.00' }).price).toBe(
      '1800.00',
    );
    expect(updateProductSchema.safeParse({ ...validPayload(), stock: -3 }).success).toBe(false);
  });
});

describe('productIdParamSchema', () => {
  it('acepta un UUID y rechaza cualquier otra cosa', () => {
    expect(productIdParamSchema.parse({ id: CATEGORY_UUID }).id).toBe(CATEGORY_UUID);
    expect(productIdParamSchema.safeParse({ id: 'producto-1' }).success).toBe(false);
    expect(productIdParamSchema.safeParse({}).success).toBe(false);
  });
});
