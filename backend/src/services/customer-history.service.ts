/** Capa de negocio que combina compras paginadas con los saldos de HU-19 (HU-36). */
import type { CreditService } from './credit.service.js';
import type { SalesRepository } from '../repositories/sales.repository.js';
import type { CustomerPurchaseHistoryDto } from '../types/customer-history.js';

/**
 * Historial de compras de un cliente (HU-36). La lista incluye ventas al contado
 * y fiados; el estado del fiado se deriva desde la cuenta contable de HU-19.
 */
export class CustomerHistoryService {
  constructor(
    private readonly sales: Pick<SalesRepository, 'customerHistory'>,
    private readonly credit: Pick<CreditService, 'getCredit'>,
  ) {}

  /** Devuelve una página cronológica con el monto abonado y pendiente de cada fiado. */
  async getPurchases(
    customerId: string,
    page: number,
    pageSize: number,
  ): Promise<CustomerPurchaseHistoryDto> {
    const [credit, result] = await Promise.all([
      this.credit.getCredit(customerId),
      this.sales.customerHistory(customerId, page, pageSize),
    ]);
    const fiados = new Map(credit.fiados.map((fiado) => [fiado.saleId, fiado]));

    return {
      page,
      pageSize,
      total: result.total,
      pageCount: Math.max(1, Math.ceil(result.total / pageSize)),
      sales: result.sales.map((sale) => {
        const fiado = fiados.get(sale.id);

        return {
          ...sale,
          credit:
            sale.paymentMethod !== 'CREDIT' || fiado === undefined
              ? null
              : {
                  paidAmount: fiado.paidAmount,
                  pendingAmount: fiado.pendingAmount,
                  status: fiado.status,
                },
        };
      }),
    };
  }
}
