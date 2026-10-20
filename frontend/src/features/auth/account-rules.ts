/**
 * Validaciones del formulario de cuenta, iguales a las del backend
 * (backend/src/validators/auth.validator.ts). El backend es quien decide: esto
 * solo evita viajes al servidor y explica el error junto al campo.
 */

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateName(name: string): string | undefined {
  if (name.trim() === '') {
    return 'Escriba su nombre.';
  }

  return name.trim().length > 80 ? 'El nombre no puede superar 80 caracteres.' : undefined;
}

export function validateEmail(email: string): string | undefined {
  if (email.trim() === '') {
    return 'Escriba su correo electrónico.';
  }

  return EMAIL_PATTERN.test(email.trim()) ? undefined : 'El correo no es válido.';
}

/**
 * Formato de la contraseña al iniciar sesión (HU-11): solo la longitud. La
 * política completa (letra y número) es de las contraseñas nuevas.
 */
export function validateLoginPassword(password: string): string | undefined {
  if (password === '') {
    return 'Escriba su contraseña.';
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }

  return password.length > PASSWORD_MAX_LENGTH
    ? `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres.`
    : undefined;
}

export function validateNewPassword(password: string): string | undefined {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }

  if (!/\p{L}/u.test(password)) {
    return 'La contraseña debe incluir al menos una letra.';
  }

  return /\d/.test(password) ? undefined : 'La contraseña debe incluir al menos un número.';
}

/** Traduce `details` de un 400 del backend (`{campo: [mensajes]}`) al primer mensaje de cada campo. */
export function fieldErrorsFromDetails(details: unknown): Record<string, string> {
  if (typeof details !== 'object' || details === null) {
    return {};
  }

  const errors: Record<string, string> = {};

  for (const [field, messages] of Object.entries(details)) {
    if (Array.isArray(messages) && typeof messages[0] === 'string') {
      errors[field] = messages[0];
    }
  }

  return errors;
}
