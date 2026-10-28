import { describe, expect, it } from 'vitest';
import { businessSettingsSchema } from './business.validator.js';

/** Configuración › General: validación de los datos del negocio. */

const VALID = {
  name: '  Abastecedor Nuevo Amanecer ',
  legalId: '3-101-123456',
  phone: '+506 2222-3333',
  email: 'ventas@nuevoamanecer.cr',
  address: 'Heredia, 100 m norte del parque',
  receiptMessage: '¡Gracias por su compra!',
};

function errors(input: unknown): Record<string, string[] | undefined> {
  const result = businessSettingsSchema.safeParse(input);

  return result.success ? {} : (result.error.flatten().fieldErrors as Record<string, string[]>);
}

describe('businessSettingsSchema', () => {
  it('acepta datos completos y recorta los espacios', () => {
    const parsed = businessSettingsSchema.parse(VALID);

    expect(parsed.name).toBe('Abastecedor Nuevo Amanecer');
    expect(parsed.phone).toBe('+506 2222-3333');
  });

  it('solo el nombre es obligatorio; lo opcional vacío se guarda como null', () => {
    expect(businessSettingsSchema.parse({ name: 'Mi negocio', legalId: '', phone: '   ' })).toEqual(
      {
        name: 'Mi negocio',
        legalId: null,
        phone: null,
        email: null,
        address: null,
        receiptMessage: null,
      },
    );
  });

  it('rechaza nombre vacío, correo inválido y teléfono con letras', () => {
    const found = errors({ ...VALID, name: '  ', email: 'no-es-correo', phone: 'llamar luego' });

    expect(found['name']).toEqual(['El nombre del negocio es obligatorio.']);
    expect(found['email']).toEqual(['El correo no es válido.']);
    expect(found['phone']?.[0]).toMatch(/solo puede tener números/);
  });

  it('limita el largo de cada campo', () => {
    const found = errors({ ...VALID, name: 'x'.repeat(81), receiptMessage: 'x'.repeat(121) });

    expect(found['name']?.[0]).toMatch(/80 caracteres/);
    expect(found['receiptMessage']?.[0]).toMatch(/120 caracteres/);
  });
});
