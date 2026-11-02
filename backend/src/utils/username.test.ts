import { describe, expect, it } from 'vitest';
import { firstAvailable, USERNAME_PATTERN, usernameBase } from './username.js';

/** Usuario sugerido a partir del nombre (HU-12). */
describe('usernameBase', () => {
  it.each([
    ['Juan Navarro', 'jnavarro'],
    ['Juan Navarro Mora', 'jnavarro'],
    ['Juan Carlos Navarro Mora', 'jnavarro'],
    ['María José Muñoz Peña', 'mmunoz'],
    ['  ÁNGELA   Álvarez  ', 'aalvarez'],
    ['Administrador', 'administrador'],
    ["Sinéad O'Brien", 'sobrien'],
    ['', 'usuario'],
    ['3M Proveedores', 'u3proveedores'],
  ])('«%s» → %s', (name, expected) => {
    expect(usernameBase(name)).toBe(expected);
    expect(usernameBase(name)).toMatch(USERNAME_PATTERN);
  });

  it('nunca pasa de 30 caracteres, ni con el número agregado', () => {
    const base = usernameBase('Ana Bartholomewjohnsonsmithersonwilliams');

    expect(`${base}99`.length).toBeLessThanOrEqual(30);
  });
});

describe('firstAvailable', () => {
  it('usa la base si está libre; si no, el primer número libre', () => {
    expect(firstAvailable('jnavarro', [])).toBe('jnavarro');
    expect(firstAvailable('jnavarro', ['jnavarro'])).toBe('jnavarro2');
    expect(firstAvailable('jnavarro', ['jnavarro', 'jnavarro2', 'jnavarro4'])).toBe('jnavarro3');
  });
});
