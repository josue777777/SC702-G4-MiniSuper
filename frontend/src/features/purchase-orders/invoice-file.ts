/**
 * Reglas de la factura del proveedor que se adjunta a una entrega (HU-38), las
 * mismas que revisa el servidor: PDF o imagen, hasta 5 MB. Revisarlas aquí
 * evita subir un archivo que igual sería rechazado.
 */

/** Tipos aceptados (para el `accept` del selector y para validar). */
export const INVOICE_ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp';

export const MAX_INVOICE_BYTES = 5 * 1024 * 1024;

/**
 * El error del archivo elegido, o `null` si se puede adjuntar.
 *
 * @example invoiceFileError({ type: 'application/pdf', size: 120_000 }) // null
 * @example invoiceFileError({ type: 'text/plain', size: 10 }) // "Adjunte un PDF o una imagen…"
 */
export function invoiceFileError(file: Pick<File, 'type' | 'size'>): string | null {
  if (!INVOICE_ACCEPT.split(',').includes(file.type)) {
    return 'Adjunte un PDF o una imagen (PNG, JPG o WEBP) de la factura.';
  }

  if (file.size > MAX_INVOICE_BYTES) {
    return 'La factura supera el máximo de 5 MB.';
  }

  return null;
}
