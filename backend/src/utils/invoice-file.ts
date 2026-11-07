import { hasImageSignature, IMAGE_TYPES, type ImageMimeType } from './image.js';

/**
 * Archivos de factura del proveedor (HU-38): PDF o una foto/escaneo (PNG, JPG,
 * WEBP). Se aceptan solo estos y se revisa la firma de los bytes, igual que con
 * las imágenes: la cabecera `Content-Type` la escribe el cliente.
 */
export const INVOICE_FILE_TYPES = ['application/pdf', ...IMAGE_TYPES] as const;

export type InvoiceFileType = (typeof INVOICE_FILE_TYPES)[number];

/** Tope de una factura adjunta: 5 MB (un PDF escaneado de varias páginas cabe). */
export const MAX_INVOICE_FILE_BYTES = 5 * 1024 * 1024;

/** Un PDF empieza siempre con «%PDF-». */
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

/**
 * ¿El contenido es de verdad del tipo que declara?
 *
 * @example hasInvoiceSignature('application/pdf', bytesDe('%PDF-1.7 …')) // true
 */
export function hasInvoiceSignature(mimeType: InvoiceFileType, data: Uint8Array): boolean {
  if (mimeType === 'application/pdf') {
    return PDF_SIGNATURE.every((byte, index) => data[index] === byte);
  }

  return hasImageSignature(mimeType as ImageMimeType, data);
}

/**
 * Nombre del archivo que manda la pantalla en `X-File-Name` (codificado con
 * `encodeURIComponent`). Se limpia: sin rutas, sin caracteres de control y con
 * un largo razonable; si no sirve, «factura».
 *
 * @example invoiceFileName('Factura%20F-120.pdf') // "Factura F-120.pdf"
 */
export function invoiceFileName(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header[0] : header;
  const name = safeDecode(raw ?? '');

  // eslint-disable-next-line no-control-regex
  const clean = (name.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f"]/g, '').trim();

  return clean === '' ? 'factura' : clean.slice(0, 120);
}

/** `decodeURIComponent` que no lanza: un texto mal codificado queda vacío. */
function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return '';
  }
}
