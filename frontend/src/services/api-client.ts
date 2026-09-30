import { API_BASE_URL } from '../config/env';
import type { ApiErrorBody } from '../types/api';

/** Error de la capa de servicios: trae el código HTTP y el mensaje del backend. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Única función del frontend que usa `fetch`.
 *
 * Centraliza: URL base, cabeceras, parseo de JSON y traducción de los errores
 * `{ error: { message } }` del backend a `ApiError`. Los componentes nunca
 * llaman a `fetch` directamente: llaman a un service
 * (`src/services/*.service.ts`) que usa esta función.
 */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    // El backend está apagado o no hay red: es el caso más frecuente en
    // desarrollo, y merece un mensaje útil en pantalla.
    throw new ApiError(
      0,
      `No hay conexión con el servidor (${API_BASE_URL}). ¿Está ejecutándose "npm run dev"?`,
    );
  }

  const text = await response.text();
  const payload = text === '' ? null : parseJson(text);

  if (!response.ok) {
    const body = payload as ApiErrorBody | null;

    throw new ApiError(
      response.status,
      body?.error?.message ?? `La petición falló (${response.status}).`,
      body?.error?.details,
    );
  }

  return payload as T;
}

/** GET tipado. Equivale a `apiRequest<T>(path, { method: 'GET' })`. */
export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'GET' });
}

/** POST tipado con cuerpo JSON (crear un recurso). */
export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

/**
 * PATCH tipado. El cuerpo es opcional porque hay acciones que solo cambian el
 * estado del recurso (por ejemplo desactivar un producto, HU-03).
 */
export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'PATCH',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
