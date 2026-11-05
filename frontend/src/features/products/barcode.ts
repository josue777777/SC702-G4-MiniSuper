const L_CODES = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
] as const;
const G_CODES = [
  '0100111',
  '0110011',
  '0011011',
  '0100001',
  '0011101',
  '0111001',
  '0000101',
  '0010001',
  '0001001',
  '0010111',
] as const;
const R_CODES = [
  '1110010',
  '1100110',
  '1101100',
  '1000010',
  '1011100',
  '1001110',
  '1010000',
  '1000100',
  '1001000',
  '1110100',
] as const;
const FIRST_DIGIT_PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
] as const;

/*
 * Código de barras EAN-13 (HU-06, HU-07), sin librerías: se valida y se dibuja a mano.
 * Las tablas de arriba (L, G, R y la paridad del primer dígito) son las del estándar
 * EAN-13: dicen qué barras (1) y espacios (0) le tocan a cada dígito.
 */

/**
 * ¿Es un EAN-13 válido? Revisa que tenga 13 dígitos y que el último (dígito de
 * control) coincida con los 12 primeros.
 *
 * Cálculo: los 12 primeros dígitos se multiplican alternando por 1 y por 3; el
 * control es lo que falta para llegar a la siguiente decena.
 *
 * @param barcode Texto leído o escrito (por ejemplo, `"7501234567893"`).
 * @returns `true` si el formato y el dígito de control son correctos.
 * @example
 * isValidEan13('7501234567893'); // true  (suma 117 → control 3)
 * isValidEan13('7501234567890'); // false (el control debería ser 3)
 */
export function isValidEan13(barcode: string): boolean {
  if (!/^\d{13}$/.test(barcode)) {
    return false;
  }

  const sum = [...barcode.slice(0, 12)].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3),
    0,
  );

  return Number(barcode[12]) === (10 - (sum % 10)) % 10;
}

/**
 * Genera un EAN-13 aleatorio con su dígito de control correcto, para productos que
 * no traen código del fabricante. Es de uso interno: no es un código GS1 registrado.
 *
 * @returns 13 dígitos, por ejemplo `"4829301750462"`.
 */
export function generateEan13(): string {
  const digits = Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((value) => String(value % 10))
    .join('');
  const sum = [...digits].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3),
    0,
  );

  return `${digits}${(10 - (sum % 10)) % 10}`;
}

/**
 * Traduce un EAN-13 a los 95 «módulos» (barras `1` y espacios `0`) que se dibujan:
 * guarda inicial `101`, 6 dígitos izquierdos, guarda central `01010`, 6 dígitos
 * derechos y guarda final `101`.
 *
 * @param barcode Un EAN-13 válido.
 * @returns Una cadena de 95 caracteres `0`/`1`.
 * @throws Error si el código no es un EAN-13 válido.
 */
export function ean13Modules(barcode: string): string {
  if (!isValidEan13(barcode)) {
    throw new Error('El código de barras debe ser un EAN-13 válido.');
  }

  const parity = FIRST_DIGIT_PARITY[Number(barcode[0])];
  const left = [...barcode.slice(1, 7)]
    .map((digit, index) => (parity[index] === 'L' ? L_CODES : G_CODES)[Number(digit)])
    .join('');
  const right = [...barcode.slice(7)].map((digit) => R_CODES[Number(digit)]).join('');

  return `101${left}01010${right}101`;
}

/**
 * Dibuja el código de barras como SVG: un rectángulo negro por cada módulo `1`.
 * Lo usan la etiqueta del producto y su impresión.
 *
 * @param barcode Un EAN-13 válido.
 * @returns El texto de un `<svg>` listo para insertar o imprimir.
 */
export function ean13Svg(barcode: string): string {
  const bars = [...ean13Modules(barcode)]
    .map((module, index) =>
      module === '1' ? `<rect x="${index + 9}" y="0" width="1" height="50"/>` : '',
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 113 50" role="img" aria-label="Código de barras ${barcode}"><rect width="113" height="50" fill="white"/>${bars}</svg>`;
}
