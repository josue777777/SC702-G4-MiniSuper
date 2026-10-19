import { describe, expect, it } from 'vitest';
import { loginSchema, setupSchema, updateProfileSchema } from './auth.validator.js';

/** Validaciones de la cuenta del dueño (HU-12) y del perfil (HU-14). */

const valid = { name: '  Ana Pérez ', email: ' ANA@Correo.CR ', password: 'ClaveSegura123' };

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('setupSchema', () => {
  it('normaliza el nombre y pasa el correo a minúsculas', () => {
    const parsed = setupSchema.parse(valid);

    expect(parsed.name).toBe('Ana Pérez');
    expect(parsed.email).toBe('ana@correo.cr');
  });

  it('rechaza un correo con formato inválido', () => {
    expect(setupSchema.safeParse({ ...valid, email: 'no-es-un-correo' }).success).toBe(false);
  });

  it('rechaza contraseñas cortas, sin números o sin letras', () => {
    const short = setupSchema.safeParse({ ...valid, password: 'Corta1' });
    const noDigit = setupSchema.safeParse({ ...valid, password: 'SoloLetrasLargas' });
    const noLetter = setupSchema.safeParse({ ...valid, password: '1234567890123' });

    expect(messages(short)).toContain('La contraseña debe tener al menos 10 caracteres.');
    expect(messages(noDigit)).toContain('La contraseña debe incluir al menos un número.');
    expect(messages(noLetter)).toContain('La contraseña debe incluir al menos una letra.');
  });

  it('rechaza una contraseña igual al correo', () => {
    const result = setupSchema.safeParse({
      ...valid,
      email: 'ana1234567@correo.cr',
      password: 'ana1234567@correo.cr',
    });

    expect(messages(result)).toContain('La contraseña no puede ser igual al correo.');
  });

  it('rechaza el nombre vacío y las contraseñas gigantes', () => {
    expect(setupSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
    expect(setupSchema.safeParse({ ...valid, password: `a1${'x'.repeat(200)}` }).success).toBe(
      false,
    );
  });
});

describe('loginSchema', () => {
  it('no aplica la política de contraseñas, solo exige que venga', () => {
    expect(loginSchema.safeParse({ email: 'ana@correo.cr', password: 'x' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'ana@correo.cr', password: '' }).success).toBe(false);
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
