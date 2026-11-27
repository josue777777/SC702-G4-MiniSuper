/** Cliente HTTP del historial de compras asociado al perfil del cliente (HU-36). */
import { DEFAULT_PAGE_SIZE } from '../components/use-pagination';
import type { CustomerPurchaseHistory } from '../types/sales';
import { apiGet } from './api-client';

interface DataResponse<T> {
  data: T;
}

/** Lectura paginada del historial de compras de un cliente (HU-36). */
export const customerHistoryService = {
  /** Compras al contado y fiados, ordenados por fecha descendente. */
  async purchases(
    customerId: string,
    page: number,
    pageSize: number = DEFAULT_PAGE_SIZE,
  ): Promise<CustomerPurchaseHistory> {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });

    return (
      await apiGet<DataResponse<CustomerPurchaseHistory>>(
        `/api/customers/${encodeURIComponent(customerId)}/purchases?${query}`,
      )
    ).data;
  },
};
