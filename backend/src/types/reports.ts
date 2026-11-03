/**
 * Contratos de los reportes comerciales (HU-28, HU-29, HU-30).
 * El frontend mantiene su copia en `frontend/src/types/reports.ts`.
 *
 * Todos los reportes responden con la MISMA forma (`ReportResult`): lo que se ve
 * en pantalla y lo que se exporta a Excel salen del mismo objeto, así que no
 * pueden diferir. El dinero viaja como cadena con dos decimales (`"1500.00"`).
 */

export type ReportKind = 'sales' | 'profits' | 'top-products' | 'customer-debts';

/** Filtros de los reportes por período. Las fechas son días (`YYYY-MM-DD`) de la zona del negocio. */
export interface ReportFilter {
  from: string;
  to: string;
  /** Solo el reporte de ventas: categoría ACTUAL del producto. */
  categoryId?: string;
  /** Solo el reporte de ventas: precio de venta HISTÓRICO de la línea. */
  minPrice?: string;
  maxPrice?: string;
}

export interface ReportColumn {
  key: string;
  label: string;
  /** Importe en colones: se presenta con formato de dinero y se exporta como número. */
  money?: boolean;
}

export interface ReportTotal {
  label: string;
  value: string | number;
  money?: boolean;
}

export interface ReportResult {
  kind: ReportKind;
  title: string;
  businessName: string;
  /** Momento de la consulta (ISO 8601). */
  generatedAt: string;
  /** Filtros aplicados, tal como se muestran y se exportan. */
  filters: { label: string; value: string }[];
  /** Reglas y límites que el lector debe conocer para interpretar las cifras. */
  notices: string[];
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  totals: ReportTotal[];
  /** Mensaje cuando no hay filas. */
  emptyMessage: string;
}

export interface ReportOptions {
  categories: { id: string; name: string }[];
}

/** Importe tal como lo entrega Prisma (`Decimal`): solo se necesita `toFixed`. */
export interface DecimalLike {
  toFixed(digits: number): string;
}

/** Línea de venta con lo necesario para los reportes (precio y costo HISTÓRICOS). */
export interface SaleLineData {
  productId: string;
  quantity: number;
  unitPrice: DecimalLike;
  unitCost: DecimalLike;
  product: { code: string; name: string; category: { name: string } };
  /** Unidades devueltas de esta línea (una fila por devolución). */
  adjustments: { quantity: number }[];
}

/** Venta no anulada del período, con las líneas que cumplen los filtros de producto y precio. */
export interface SaleReportData {
  id: string;
  number: number;
  createdAt: Date;
  paymentMethod: 'CASH' | 'CARD' | 'CREDIT';
  customerId: string | null;
  /** Total efectivo: ya descuenta las devoluciones (HU-35). */
  total: DecimalLike;
  /** Abonos aplicados a ESTA venta (con `saleId`). Los abonos generales no aparecen aquí. */
  creditPayments: { customerId: string; amount: DecimalLike }[];
  items: SaleLineData[];
}

export interface SalesReportData {
  businessName: string;
  /** Nombre de la categoría filtrada; `null` si no se filtró o no existe en el negocio. */
  categoryName: string | null;
  sales: SaleReportData[];
}

export interface DebtCustomerData {
  id: string;
  name: string;
  /** Ventas a crédito del cliente (las anuladas ya tienen total 0). */
  sales: { id: string; number: number; createdAt: Date; total: DecimalLike }[];
  /** Todos sus abonos; `saleId` nulo = abono general, sin venta asignada. */
  creditPayments: { amount: DecimalLike; saleId: string | null }[];
}

export interface DebtsReportData {
  businessName: string;
  customers: DebtCustomerData[];
}
