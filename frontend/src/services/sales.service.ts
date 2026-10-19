import type {
  CreateSalePayload,
  Customer,
  CustomerPayload,
  PaymentMethod,
  Sale,
  SaleProduct,
  SaleSummary,
} from '../types/sales';
import { apiGet, apiPost } from './api-client';

interface DataResponse<T> {
  data: T;
}

export const salesService = {
  /** HU-16: producto vendible por código interno o código de barras. 404 si no existe. */
  async lookupProduct(code: string): Promise<SaleProduct> {
    const query = new URLSearchParams({ code });

    return (await apiGet<DataResponse<SaleProduct>>(`/api/sales/lookup?${query.toString()}`)).data;
  },

  /** HU-16/17/18: confirma la venta. Reenviar la misma llave no duplica la venta. */
  async create(payload: CreateSalePayload): Promise<Sale> {
    return (await apiPost<DataResponse<Sale>>('/api/sales', payload)).data;
  },

  /** HU-17: historial mínimo, con filtro por método de pago. */
  async list(paymentMethod?: PaymentMethod): Promise<SaleSummary[]> {
    const query = paymentMethod === undefined ? '' : `?paymentMethod=${paymentMethod}`;

    return (await apiGet<DataResponse<SaleSummary[]>>(`/api/sales${query}`)).data;
  },
};

export const customersService = {
  /** HU-18: clientes activos con su saldo. */
  async list(): Promise<Customer[]> {
    return (await apiGet<DataResponse<Customer[]>>('/api/customers')).data;
  },

  /** HU-18: crea un cliente básico. */
  async create(payload: CustomerPayload): Promise<Customer> {
    return (await apiPost<DataResponse<Customer>>('/api/customers', payload)).data;
  },
};
