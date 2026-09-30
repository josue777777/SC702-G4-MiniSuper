/**
 * Error de la aplicación con código HTTP asociado.
 *
 * Los services lanzan este error cuando una regla de negocio se incumple
 * ("el stock disponible no alcanza para la cantidad vendida", HU-16) y el middleware
 * `errorHandler` lo convierte en la respuesta JSON correspondiente. Así ningún
 * controller necesita escribir `res.status(...)`.
 */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  /** Datos enviados incorrectos (400). */
  static badRequest(message: string, details?: unknown): HttpError {
    return new HttpError(400, message, details);
  }

  /** Credenciales inválidas (401). */
  static unauthorized(message = 'No autenticado.'): HttpError {
    return new HttpError(401, message);
  }

  /** No tiene permiso para esa acción (403). */
  static forbidden(message = 'No tiene permiso para realizar esta acción.'): HttpError {
    return new HttpError(403, message);
  }

  /** El recurso no existe (404). */
  static notFound(message = 'El recurso no existe.'): HttpError {
    return new HttpError(404, message);
  }

  /** Conflicto con el estado actual: código duplicado, stock insuficiente… (409). */
  static conflict(message: string, details?: unknown): HttpError {
    return new HttpError(409, message, details);
  }

  /** Falló la integración con un sistema externo (502). */
  static externalService(message: string, details?: unknown): HttpError {
    return new HttpError(502, message, details);
  }
}
