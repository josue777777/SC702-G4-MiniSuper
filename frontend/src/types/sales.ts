/** Contratos de ventas, método de pago y fiado (HU-16, HU-17, HU-18). Reflejan backend/src/types/sales.ts. */

export type PaymentMethod = 'CASH' | 'CARD' | 'CREDIT';

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
  productId: string;
  code: string;
  name: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
}

export interface Sale {
  id: string;
  number: number;
  createdAt: string;
  paymentMethod: PaymentMethod;
  total: string;
  cashReceived: string | null;
  customer: { id: string; name: string } | null;
  items: SaleLine[];
  change: string | null;
  customerBalance: string | null;
}

export interface SaleSummary {
  id: string;
  number: number;
  createdAt: string;
  paymentMethod: PaymentMethod;
  total: string;
  customerName: string | null;
  itemCount: number;
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
