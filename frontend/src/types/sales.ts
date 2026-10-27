/** Contratos de ventas, método de pago y fiado (HU-16, HU-17, HU-18). Reflejan backend/src/types/sales.ts. */

export type PaymentMethod = 'CASH' | 'CARD' | 'CREDIT';
export type SaleStatus = 'COMPLETED' | 'PARTIALLY_RETURNED' | 'RETURNED' | 'VOID';
export type SaleAdjustmentType = 'RETURN' | 'VOID';

export interface SaleProduct {
  id: string;
  code: string;
  barcode: string | null;
  name: string;
  price: string;
  stock: number;
  isActive: boolean;
}

export interface SaleLine {
  id: string;
  productId: string;
  code: string;
  name: string;
  quantity: number;
  returnedQuantity: number;
  availableQuantity: number;
  unitPrice: string;
  subtotal: string;
}

export interface SaleAdjustment {
  id: string;
  type: SaleAdjustmentType;
  reason: string;
  total: string;
  createdAt: string;
  items: { saleItemId: string; productName: string; quantity: number }[];
}

export interface Sale {
  id: string;
  number: number;
  createdAt: string;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  total: string;
  originalTotal: string;
  cashReceived: string | null;
  customer: { id: string; name: string } | null;
  items: SaleLine[];
  adjustments: SaleAdjustment[];
  change: string | null;
  customerBalance: string | null;
}

export interface SaleSummary {
  id: string;
  number: number;
  createdAt: string;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  total: string;
  customerName: string | null;
  itemCount: number;
}

export type SaleAdjustmentPayload =
  | {
      type: 'RETURN';
      reason: string;
      items: { saleItemId: string; quantity: number }[];
    }
  | { type: 'VOID'; reason: string };

/** Totales agregados de las ventas del día de negocio (HU-37). */
export interface DailySalesSummary {
  saleCount: number;
  total: string;
  cash: string;
  card: string;
  credit: string;
}

/** El navegador solo envía producto y cantidad: precios y total los calcula el servidor. */
export interface CreateSalePayload {
  idempotencyKey: string;
  items: { productId: string; quantity: number }[];
  paymentMethod: PaymentMethod;
  cashReceived?: string;
  customerId?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  /** Ventas a crédito acumuladas menos abonos. */
  balance: string;
}

export interface CustomerPayload {
  name: string;
  phone: string;
}
