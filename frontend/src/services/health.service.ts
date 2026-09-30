import type { DatabaseStatus, ServiceStatus } from '../types/api';
import { apiGet } from './api-client';

/**
 * Service de salud del sistema.
 *
 * Los componentes no conocen rutas ni fetch: hablan con un service con nombre
 * de la cosa que muestran en pantalla. Cuando existan productos o ventas,
 * tendrán su propio `product.service.ts`, `sale.service.ts`, etc.
 */
export const healthService = {
  /** El backend está levantando (no depende de la base de datos). */
  getServiceStatus(): Promise<ServiceStatus> {
    return apiGet<ServiceStatus>('/api/health');
  },

  /**
   * Estado de PostgreSQL.
   * El backend responde 503 cuando la base no está disponible, y `apiRequest`
   * lo convierte en un `ApiError`: por eso el componente debe capturarla.
   */
  getDatabaseStatus(): Promise<DatabaseStatus> {
    return apiGet<DatabaseStatus>('/api/health/database');
  },
};
