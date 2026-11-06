import { API_BASE_URL } from '../config/env';
import type { Business, BusinessSettings } from '../types/business';
import { apiGet, apiRequest } from './api-client';

interface DataResponse<T> {
  data: T;
}

function put<T>(path: string, body: unknown): Promise<DataResponse<T>> {
  return apiRequest<DataResponse<T>>(path, { method: 'PUT', body: JSON.stringify(body) });
}

export const businessService = {
  /** Datos, logo y plan del negocio de la sesión (cualquier usuario del negocio). */
  async get(): Promise<Business> {
    return (await apiGet<DataResponse<Business>>('/api/business')).data;
  },

  /** Datos del negocio. Solo su Encargado (la API responde 403 a los demás). */
  async update(settings: BusinessSettings): Promise<Business> {
    return (await put<Business>('/api/business', settings)).data;
  },

  /** Sube o reemplaza el logo (PNG, JPG o WEBP de hasta 1 MB). */
  async uploadLogo(file: File): Promise<Business> {
    return (
      await apiRequest<DataResponse<Business>>('/api/business/logo', {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
    ).data;
  },

  async removeLogo(): Promise<Business> {
    return (await apiRequest<DataResponse<Business>>('/api/business/logo', { method: 'DELETE' }))
      .data;
  },

  /**
   * El logo como `data:` URL, para las etiquetas (HU-07): la impresión se arma en
   * un documento aparte, y así la imagen ya va dentro y no depende de la sesión.
   *
   * @returns La imagen lista para `<img src>`, o `null` si no se pudo leer.
   */
  async logoDataUrl(logoUrl: string): Promise<string | null> {
    try {
      const response = await fetch(`${API_BASE_URL}${logoUrl}`, { credentials: 'include' });

      if (!response.ok) {
        return null;
      }

      const blob = await response.blob();

      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader();

        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      // Sin logo la etiqueta igual se imprime; no vale la pena frenar por eso.
      return null;
    }
  },

  /** URL completa para `<img src>`. */
  logoSrc(logoUrl: string): string {
    return `${API_BASE_URL}${logoUrl}`;
  },
};
