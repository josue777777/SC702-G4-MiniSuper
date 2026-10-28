/**
 * Contratos de ventas, método de pago y fiado (HU-16, HU-17, HU-18).
 * El frontend mantiene su copia en `frontend/src/types/sales.ts`.
 *
 * Dinero: cadenas con dos decimales (`"1500.00"`), como en `types/products.ts`.
 */

export type PaymentMethodKind = 'CASH' | 'CARD' | 'CREDIT';
export type SaleStatusKind = 'COMPLETED' | 'PARTIALLY_RETURNED' | 'RETURNED' | 'VOID';
export type SaleAdjustmentTypeKind = 'RETURN' | 'VOID';

export type MoneyString = string;

/** Producto tal como lo necesita la caja: precio y stock vigentes. */
export interface SaleProductDto {
  id: string;
  code: string;
  barcode: string | null;
  name: string;
  price: MoneyString;
  stock: number;
  isActive: boolean;
}

/** Línea de una venta, con el precio histórico guardado (no el del catálogo). */
export interface SaleLineDto {
  id: string;
  productId: string;
  code: string;
  name: string;
  quantity: number;
  returnedQuantity: number;
  availableQuantity: number;
  unitPrice: MoneyString;
  subtotal: MoneyString;
}

export interface SaleAdjustmentDto {
  id: string;
  type: SaleAdjustmentTypeKind;
  reason: string;
  total: MoneyString;
  createdAt: string;
  items: { saleItemId: string; productName: string; quantity: number }[];
}

/** Venta tal como se guarda, sin los datos derivados. */
export interface SaleRecord {
  id: string;
  number: number;
  /** Fecha y hora de la venta (ISO 8601). */
  createdAt: string;
  paymentMethod: PaymentMethodKind;
  status: SaleStatusKind;
  total: MoneyString;
  originalTotal: MoneyString;
  cashReceived: MoneyString | null;
  customer: { id: string; name: string } | null;
  items: SaleLineDto[];
  adjustments: SaleAdjustmentDto[];
}

/** Venta que expone la API: lo guardado más el cambio y el saldo del fiado, derivados. */
export interface SaleDto extends SaleRecord {
  /** Cambio a devolver (efectivo recibido − total); solo en ventas CASH. */
  change: MoneyString | null;
  /** Saldo acumulado del cliente tras esta venta; solo en ventas CREDIT (HU-18). */
  customerBalance: MoneyString | null;
}

/** Fila del historial mínimo (HU-17: filtrar por método de pago). */
export interface SaleSummaryDto {
  id: string;
  number: number;
  createdAt: string;
  paymentMethod: PaymentMethodKind;
  status: SaleStatusKind;
  total: MoneyString;
  customerName: string | null;
  itemCount: number;
}

/** Totales agregados de las ventas del día de negocio (HU-37). */
export interface DailySalesSummaryDto {
  saleCount: number;
  total: MoneyString;
  cash: MoneyString;
  card: MoneyString;
  credit: MoneyString;
}

export interface SaleListFilter {
  paymentMethod?: PaymentMethodKind;
  limit: number;
}

export interface SaleAdjustmentPlan {
  saleId: string;
  type: SaleAdjustmentTypeKind;
  reason: string;
  items?: { saleItemId: string; quantity: number }[];
}

export type SaleAdjustmentOutcome =
  | { ok: true; sale: SaleRecord }
  | {
      ok: false;
      reason:
        'NOT_FOUND' | 'ALREADY_VOID' | 'ALREADY_RETURNED' | 'INVALID_ITEM' | 'QUANTITY_EXCEEDED';
    };

/** Línea que el service le pide al repositorio descontar y registrar. */
export interface SalePlanItem {
  productId: string;
  quantity: number;
  /** Precio con el que el service calculó el total; el repositorio lo verifica. */
  expectedUnitPrice: MoneyString;
}

/** Venta ya validada y calculada por el service. */
export interface CreateSalePlan {
  idempotencyKey: string;
  paymentMethod: PaymentMethodKind;
  customerId: string | null;
  cashReceived: MoneyString | null;
  total: MoneyString;
  items: SalePlanItem[];
}

/** Resultado de intentar confirmar: la venta o el motivo por el que no se pudo. */
export type CreateSaleOutcome =
  | { ok: true; sale: SaleRecord; created: boolean }
  | {
      ok: false;
      reason: 'INSUFFICIENT_STOCK' | 'PRICE_CHANGED' | 'UNAVAILABLE';
      productId: string;
    };

/** Cliente mínimo para validar una venta a crédito. */
export interface CustomerRef {
  id: string;
  name: string;
  isActive: boolean;
}

/** Totales con los que se deriva el saldo del fiado (nunca se guarda el saldo). */
export interface CreditTotals {
  /** Suma de las ventas CREDIT del cliente. */
  credited: MoneyString;
  /** Suma de los abonos (CreditPayment) del cliente. */
  paid: MoneyString;
}

/** Cliente que expone la API (HU-18), con su saldo calculado. */
export interface CustomerDto {
  id: string;
  name: string;
  phone: string | null;
  /** Ventas a crédito acumuladas menos abonos. */
  balance: MoneyString;
}

export interface CreateCustomerFields {
  name: string;
  phone: string | null;
}
