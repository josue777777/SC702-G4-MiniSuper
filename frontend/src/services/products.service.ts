import type { Product, ProductFormOptions, ProductPayload } from '../types/products';
import { apiGet, apiPatch, apiPost } from './api-client';

/**
 * Service de productos (HU-01, HU-02, HU-03).
 *
 * Es el único punto por el que la pantalla de productos habla con la API: los
 * componentes no conocen rutas ni `fetch`.
 *
 * El backend envuelve el recurso en `data` (ver ProductsController), así que
 * aquí se desenvuelve una sola vez y los componentes reciben el dato directo.
 */
interface DataResponse<T> {
  data: T;
}

export const productsService = {
  /** Catálogo completo (activos e inactivos) para administrarlo. */
  async list(): Promise<Product[]> {
    const response = await apiGet<DataResponse<Product[]>>('/api/products');

    return response.data;
  },

  /** Categorías y proveedores activos para los `<select>` del formulario. */
  async getFormOptions(): Promise<ProductFormOptions> {
    const response = await apiGet<DataResponse<ProductFormOptions>>('/api/products/form-options');

    return response.data;
  },

  /** HU-01: registra un producto. El código duplicado responde 409. */
  async create(payload: ProductPayload): Promise<Product> {
    const response = await apiPost<DataResponse<Product>>('/api/products', payload);

    return response.data;
  },

  /** HU-02: guarda los cambios de un producto existente. */
  async update(id: string, payload: ProductPayload): Promise<Product> {
    const response = await apiPatch<DataResponse<Product>>(`/api/products/${id}`, payload);

    return response.data;
  },

  /** HU-03: desactiva un producto (baja lógica, conserva el historial). */
  async deactivate(id: string): Promise<Product> {
    const response = await apiPatch<DataResponse<Product>>(`/api/products/${id}/deactivate`);

    return response.data;
  },
};
