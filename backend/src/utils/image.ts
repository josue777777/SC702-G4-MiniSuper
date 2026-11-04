import express, { type NextFunction, type Request, type Response } from 'express';
import { HttpError } from './http-error.js';

/**
 * Reglas compartidas para las imágenes que se suben (producto, logo del
 * negocio). En un solo lugar, para que una corrección de seguridad aplique a
 * todas.
 */

/** Formatos aceptados. Sin SVG: puede llevar código (XSS). */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type ImageMimeType = (typeof IMAGE_TYPES)[number];

/**
 * Primeros bytes ("firma" o "número mágico") de cada formato aceptado. Se
 * revisan porque la cabecera `Content-Type` la escribe el cliente: un archivo
 * cualquiera renombrado como `.png` no tiene la firma de un PNG.
 */
const IMAGE_SIGNATURES: Record<ImageMimeType, (data: Uint8Array) => boolean> = {
  'image/png': (data) => startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': (data) => startsWith(data, [0xff, 0xd8, 0xff]),
  // WEBP: "RIFF" + 4 bytes de tamaño + "WEBP".
  'image/webp': (data) =>
    startsWith(data, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(data.subarray(8), [0x57, 0x45, 0x42, 0x50]),
};

function startsWith(data: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => data[index] === byte);
}

/** ¿El contenido es de verdad del tipo que declara? */
export function hasImageSignature(mimeType: ImageMimeType, data: Uint8Array): boolean {
  return IMAGE_SIGNATURES[mimeType](data);
}

/** Tipo declarado en la cabecera, sin parámetros y en minúsculas. */
export function declaredContentType(req: Request): string | undefined {
  return req.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
}

/**
 * Middleware que lee el cuerpo de la petición como bytes, con tope de tamaño.
 * Si el archivo se pasa, responde 413 con un mensaje claro en vez de un 500.
 */
export function imageBodyParser(maxBytes: number, tooLargeMessage: string) {
  const readBytes = express.raw({ type: () => true, limit: maxBytes });

  return (req: Request, res: Response, next: NextFunction): void => {
    void readBytes(req, res, (error?: unknown) => {
      if ((error as { type?: string } | undefined)?.type === 'entity.too.large') {
        next(new HttpError(413, tooLargeMessage));

        return;
      }

      next(error);
    });
  };
}
