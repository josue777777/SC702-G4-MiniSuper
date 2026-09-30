import type { Request, Response } from 'express';

/**
 * Respuesta 404 para rutas que no existen. Se registra después de todas las
 * rutas montadas: si Express llega hasta aquí, ninguna coincidió.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      message: `La ruta ${req.method} ${req.originalUrl} no existe.`,
    },
  });
}
