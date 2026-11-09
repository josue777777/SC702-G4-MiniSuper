import type {
  CreateSalePayload,
  Customer,
  CustomerPayload,
  DailySalesSummary,
  DailySalesHistory,
  PaymentMethod,
  SaleAdjustmentPayload,
  Sale,
  SaleProduct,
  SaleSummary,
} from '../types/sales';
import { apiGet, apiPost } from './api-client';
import { DEFAULT_PAGE_SIZE } from '../components/use-pagination';

interface DataResponse<T> {
  data: T;
}

export const salesService = {
  async dailyHistory(
    date: string,
    page: number,
    paymentMethod?: PaymentMethod,
  ): Promise<DailySalesHistory> {
    // Mismo estándar de filas por página que el resto de las tablas (regla 2).
    const query = new URLSearchParams({
      date,
      page: String(page),
      pageSize: String(DEFAULT_PAGE_SIZE),
    });
    if (paymentMethod !== undefined) query.set('paymentMethod', paymentMethod);
    return (await apiGet<DataResponse<DailySalesHistory>>(`/api/sales/daily-history?${query}`))
      .data;
  },
  /** HU-16: producto vendible por código interno o código de barras. 404 si no existe. */
  async lookupProduct(code: string): Promise<SaleProduct> {
    const query = new URLSearchParams({ code });

    return (await apiGet<DataResponse<SaleProduct>>(`/api/sales/lookup?${query.toString()}`)).data;
  },

  /** HU-16: búsqueda manual (nombre, código o código de barras) si el lector no reconoce el código. */
  async searchProducts(term: string): Promise<SaleProduct[]> {
    const query = new URLSearchParams({ q: term });

    return (await apiGet<DataResponse<SaleProduct[]>>(`/api/sales/products?${query.toString()}`))
      .data;
  },

  /** HU-16/17/18: confirma la venta. Reenviar la misma llave no duplica la venta. */
  async create(payload: CreateSalePayload): Promise<Sale> {
    return (await apiPost<DataResponse<Sale>>('/api/sales', payload)).data;
  },

  /** HU-34: una venta guardada, con sus líneas, para su comprobante. 404 si no existe. */
  async get(id: string): Promise<Sale> {
    return (await apiGet<DataResponse<Sale>>(`/api/sales/${encodeURIComponent(id)}`)).data;
  },

  /** HU-17: historial mínimo, con filtro por método de pago. */
  async list(paymentMethod?: PaymentMethod): Promise<SaleSummary[]> {
    const query = paymentMethod === undefined ? '' : `?paymentMethod=${paymentMethod}`;

    return (await apiGet<DataResponse<SaleSummary[]>>(`/api/sales${query}`)).data;
  },

  /** HU-37: resumen completo de ventas del día de negocio, sin límite de filas. */
  async dailySummary(): Promise<DailySalesSummary> {
    return (await apiGet<DataResponse<DailySalesSummary>>('/api/sales/daily-summary')).data;
  },

  /** HU-35: registrar una devolución parcial o anular la venta completa. */
  async adjust(id: string, payload: SaleAdjustmentPayload): Promise<Sale> {
    return (
      await apiPost<DataResponse<Sale>>(`/api/sales/${encodeURIComponent(id)}/adjustments`, payload)
    ).data;
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
