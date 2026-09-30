import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { isProduction } from '../config/env.js';
import { HttpError } from '../utils/http-error.js';

/**
 * Traduce cualquier error a una respuesta JSON uniforme:
 *   { "error": { "message": "...", "details": ... } }
 *
 * Express 5 llama a este middleware cuando un handler async lanza un error,
 * por lo que los services pueden simplemente `throw` (no hay que envolverlos).
 * Debe declararse con los CUATRO parámetros para que Express lo reconozca como
 * middleware de errores.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // 1) Validación con Zod (validators/): 400 con el detalle por campo.
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        message: 'Los datos enviados no son válidos.',
        details: error.flatten().fieldErrors,
      },
    });
    return;
  }

  // 2) Incumplimiento de una regla de negocio lanzado por un service.
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      error: {
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    });
    return;
  }

  // 3) Error inesperado: se registra completo en el servidor, pero al cliente
  //    nunca se le envían trazas internas (pueden contener datos del negocio).
  console.error('Error no controlado:', error);
  res.status(500).json({
    error: {
      message: 'Ha ocurrido un error interno. Intente de nuevo.',
      ...(isProduction || !(error instanceof Error) ? {} : { details: error.message }),
    },
  });
}
