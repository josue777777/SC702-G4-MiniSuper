import { describe, expect, it } from 'vitest';
import { loginSchema, initialAdminSchema, updateProfileSchema } from './auth.validator.js';

/** Validaciones de la cuenta del dueño (HU-12), del login (HU-11) y del perfil (HU-14). */

const valid = { name: '  Ana Pérez ', email: ' ANA@Correo.CR ', password: 'ClaveSegura123' };

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('initialAdminSchema (administrador inicial del .env)', () => {
  it('normaliza el nombre y pasa el correo a minúsculas', () => {
    const parsed = initialAdminSchema.parse(valid);

    expect(parsed.name).toBe('Ana Pérez');
    expect(parsed.email).toBe('ana@correo.cr');
  });

  it('rechaza un correo con formato inválido', () => {
    expect(initialAdminSchema.safeParse({ ...valid, email: 'no-es-un-correo' }).success).toBe(
      false,
    );
  });

  it('rechaza contraseñas cortas, sin números o sin letras', () => {
    const short = initialAdminSchema.safeParse({ ...valid, password: 'Corta1' });
    const noDigit = initialAdminSchema.safeParse({ ...valid, password: 'SoloLetrasLargas' });
    const noLetter = initialAdminSchema.safeParse({ ...valid, password: '1234567890123' });

    expect(messages(short)).toContain('La contraseña debe tener al menos 10 caracteres.');
    expect(messages(noDigit)).toContain('La contraseña debe incluir al menos un número.');
    expect(messages(noLetter)).toContain('La contraseña debe incluir al menos una letra.');
  });

  it('rechaza una contraseña igual al correo', () => {
    const result = initialAdminSchema.safeParse({
      ...valid,
      email: 'ana1234567@correo.cr',
      password: 'ana1234567@correo.cr',
    });

    expect(messages(result)).toContain('La contraseña no puede ser igual al correo.');
  });

  it('rechaza el nombre vacío y las contraseñas gigantes', () => {
    expect(initialAdminSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
    expect(
      initialAdminSchema.safeParse({ ...valid, password: `a1${'x'.repeat(200)}` }).success,
    ).toBe(false);
  });
});

describe('loginSchema (HU-11)', () => {
  it('acepta credenciales con formato válido y normaliza el correo', () => {
    expect(loginSchema.parse({ email: ' ANA@Correo.CR ', password: 'ClaveSegura123' })).toEqual({
      email: 'ana@correo.cr',
      password: 'ClaveSegura123',
    });
  });

  it('exige ambos campos, cada uno con su mensaje', () => {
    const empty = loginSchema.safeParse({ email: '  ', password: '' });
    const missing = loginSchema.safeParse({});

    expect(messages(empty)).toEqual(['El correo es obligatorio.', 'La contraseña es obligatoria.']);
    expect(messages(missing)).toEqual([
      'El correo es obligatorio.',
      'La contraseña es obligatoria.',
    ]);
  });

  it('rechaza un correo con formato inválido', () => {
    const result = loginSchema.safeParse({ email: 'no-es-un-correo', password: 'ClaveSegura123' });

    expect(messages(result)).toEqual(['El correo no es válido.']);
  });

  it('valida la longitud de la contraseña, pero no la política completa', () => {
    const short = loginSchema.safeParse({ email: 'ana@correo.cr', password: 'Corta1' });
    const huge = loginSchema.safeParse({ email: 'ana@correo.cr', password: 'a1'.repeat(65) });

    expect(messages(short)).toEqual(['La contraseña debe tener al menos 10 caracteres.']);
    expect(messages(huge)).toEqual(['La contraseña no puede superar 128 caracteres.']);
    // Sin número: la política es de las contraseñas NUEVAS; el login solo compara.
    expect(
      loginSchema.safeParse({ email: 'ana@correo.cr', password: 'SoloLetrasLargas' }).success,
    ).toBe(true);
  });
});

describe('updateProfileSchema', () => {
  it('acepta cambiar solo el nombre', () => {
    expect(updateProfileSchema.parse({ name: 'Ana María' })).toEqual({ name: 'Ana María' });
  });

  it('rechaza un cuerpo sin ningún dato para actualizar', () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
    expect(updateProfileSchema.safeParse({ currentPassword: 'ClaveSegura123' }).success).toBe(
      false,
    );
  });

  it('rechaza un correo inválido y una contraseña nueva débil', () => {
    expect(updateProfileSchema.safeParse({ email: 'malo' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ newPassword: 'corta' }).success).toBe(false);
  });
});
