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

export function ean13Svg(barcode: string): string {
  const bars = [...ean13Modules(barcode)]
    .map((module, index) =>
      module === '1' ? `<rect x="${index + 9}" y="0" width="1" height="50"/>` : '',
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 113 50" role="img" aria-label="Código de barras ${barcode}"><rect width="113" height="50" fill="white"/>${bars}</svg>`;
}
