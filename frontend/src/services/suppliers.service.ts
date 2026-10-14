import type { Supplier, SupplierPayload } from '../types/suppliers';
import { apiGet, apiPatch, apiPost } from './api-client';

/** Service de proveedores (HU-21): único punto que conoce las rutas de la API. */
interface DataResponse<T> {
  data: T;
}

export const suppliersService = {
  async list(): Promise<Supplier[]> {
    const response = await apiGet<DataResponse<Supplier[]>>('/api/suppliers');

    return response.data;
  },

  /** HU-21: registrar proveedor. Un nombre repetido responde 409. */
  async create(payload: SupplierPayload): Promise<Supplier> {
    const response = await apiPost<DataResponse<Supplier>>('/api/suppliers', payload);

    return response.data;
  },

  /** HU-21: editar proveedor. */
  async update(id: string, payload: SupplierPayload): Promise<Supplier> {
    const response = await apiPatch<DataResponse<Supplier>>(`/api/suppliers/${id}`, payload);

    return response.data;
  },
};
