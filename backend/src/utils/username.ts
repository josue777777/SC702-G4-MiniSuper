/**
 * Nombres de usuario (HU-11, HU-12): con qué entra al sistema quien no usa
 * correo (el personal), y también cualquiera que lo prefiera.
 *
 * Convención de Active Directory y de muchos ERP: la inicial del nombre más el
 * primer apellido, sin tildes y en minúscula. «Juan Navarro» → `jnavarro`. Si
 * ya existe (en cualquier negocio, activo o no), se agrega un número:
 * `jnavarro2`, `jnavarro3`… Es solo una sugerencia: quien crea la cuenta la
 * puede cambiar, siempre que esté libre.
 *
 * Nunca lleva `@`: así el login distingue sin dudas un correo de un usuario.
 */

/** Largo permitido del nombre de usuario: de 2 a 30 caracteres. */
export const USERNAME_MIN_LENGTH = 2;
export const USERNAME_MAX_LENGTH = 30;

/** Empieza con letra; después letras, números, punto, guion o guion bajo. */
export const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{1,29}$/;

/** Espacio que se deja para el número cuando el usuario ya existe (`…99`). */
const BASE_MAX_LENGTH = USERNAME_MAX_LENGTH - 4;

/** Quita tildes y diéresis (`Muñoz` → `munoz`) y deja solo letras y números. */
function clean(word: string): string {
  return word
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Usuario sugerido para un nombre, sin revisar si ya existe:
 *   - «Juan Navarro» → `jnavarro`
 *   - «Juan Navarro Mora» → `jnavarro` (en Costa Rica, el penúltimo es el primer apellido)
 *   - «Juan Carlos Navarro Mora» → `jnavarro`
 *   - «Administrador» → `administrador`
 */
export function usernameBase(name: string): string {
  const words = name
    .split(/\s+/)
    .map(clean)
    .filter((word) => word !== '');
  const [first] = words;

  if (first === undefined) {
    return 'usuario';
  }

  const surname = words.length >= 3 ? words[words.length - 2] : words[1];
  let base = surname === undefined ? first : `${first.charAt(0)}${surname}`;

  if (!/^[a-z]/.test(base)) {
    base = `u${base}`;
  }

  base = base.slice(0, BASE_MAX_LENGTH);

  return base.length < USERNAME_MIN_LENGTH ? 'usuario' : base;
}

/**
 * El primer usuario libre a partir de `base`: `base`, `base2`, `base3`…
 * `taken` son los usuarios que ya existen con esa base.
 */
export function firstAvailable(base: string, taken: readonly string[]): string {
  const used = new Set(taken);

  if (!used.has(base)) {
    return base;
  }

  for (let number = 2; ; number += 1) {
    const candidate = `${base}${number}`;

    if (!used.has(candidate)) {
      return candidate;
    }
  }
}
