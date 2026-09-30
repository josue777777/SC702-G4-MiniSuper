/**
 * Tipos compartidos de las respuestas de la API.
 *
 * Se declaran a mano en lugar de importarlos del backend porque el frontend se
 * compila aparte (Vite no puede importar código de `backend/src`). Si el
 * proyecto crece, la alternativa es mover estos tipos a un workspace `shared/`.
 */

/** Cuerpo de error homogéneo que devuelve el backend (ver errorHandler). */
export interface ApiErrorBody {
  error: {
    message: string;
    details?: unknown;
  };
}

/** GET /api/health */
export interface ServiceStatus {
  status: 'ok';
  service: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
}

/** GET /api/health/database */
export interface DatabaseStatus {
  connected: boolean;
  latencyMs: number;
  error?: string;
}
