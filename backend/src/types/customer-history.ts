/** Contratos de la API para el historial de compras de un cliente (HU-36). */
import type { FiadoStatusKind } from './credit.js';
import type { SaleRecord } from './sales.js';

/**
 * Contrato del historial completo de compras de un cliente (HU-36).
 * Cada fiado refleja el estado derivado de ventas, ajustes y abonos de HU-19.
 */
export interface CustomerPurchaseDto extends SaleRecord {
  credit: {
    paidAmount: string;
    pendingAmount: string;
    status: FiadoStatusKind;
  } | null;
}

/** Página de historial del cliente, ordenada de la compra más reciente a la antigua. */
export interface CustomerPurchaseHistoryDto {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  sales: CustomerPurchaseDto[];
}
