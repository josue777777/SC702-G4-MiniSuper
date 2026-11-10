/**
 * Contratos de los reportes comerciales (HU-28, HU-29, HU-30).
 * El frontend mantiene su copia en `frontend/src/types/reports.ts`.
 *
 * Todos los reportes responden con la MISMA forma (`ReportResult`): lo que se ve
 * en pantalla y lo que se exporta a Excel salen del mismo objeto, así que no
 * pueden diferir. El dinero viaja como cadena con dos decimales (`"1500.00"`).
 */

import type { PageOf } from '../utils/paginate.js';

export type ReportKind = 'sales' | 'profits' | 'top-products' | 'customer-debts';

/**
 * Todo reporte que usa el formato común (resumen, gráficos, detalle, PDF y Excel):
 * los comerciales más el de conteos físicos (HU-10), que es de inventario y tiene
 * su propia ruta y permiso (`/api/reports/counts`, `reports.inventory`).
 */
export type ReportResultKind = ReportKind | 'physical-counts';

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
  /** El dato principal del reporte: la pantalla lo destaca sobre el resto. */
  primary?: true;
}

export interface ReportResult {
  kind: ReportResultKind;
  title: string;
  businessName: string;
  /** Momento de la consulta (ISO 8601). */
  generatedAt: string;
  /**
   * Filtros del reporte, tal como se exportan. `isDefault` marca los que no se
   * usaron («Todas», «Sin mínimo»): el Excel los lista todos y la pantalla
   * muestra solo los que el usuario eligió.
   */
  filters: { label: string; value: string; isDefault?: true }[];
  /** Cómo se calcula, en pocas palabras y en el lenguaje del dueño. */
  help: string[];
  /**
   * Avisos que aplican a ESTE resultado (por ejemplo, productos sin costo).
   * Vacío cuando no hay nada que advertir: así, cuando aparecen, se leen.
   */
  warnings: string[];
  /** Reglas y límites técnicos completos (se exportan y se consultan a pedido). */
  notices: string[];
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  totals: ReportTotal[];
  /** Mensaje cuando no hay filas. */
  emptyMessage: string;
}

/** Un punto de un gráfico: etiqueta y valor (colones o unidades). */
export interface ReportChartDatum {
  key: string;
  label: string;
  value: number;
}

export interface ReportChart {
  id: string;
  title: string;
  subtitle: string;
  /** `columns`: en el tiempo (por día); `bars`: comparar entre nombres. */
  form: 'columns' | 'bars';
  unit: 'money' | 'units' | 'products';
  data: ReportChartDatum[];
}

/**
 * Lo que la pantalla necesita para mostrar un reporte: totales, avisos y
 * gráficos, SIN las filas. Las filas pueden ser miles (un año de ventas): se
 * piden aparte, de a una página, solo si el usuario abre «Ver detalle»
 * (`ReportRowsPage`). El PDF y el Excel siguen llevando todas.
 */
export interface ReportSummary extends Omit<ReportResult, 'rows'> {
  /** Cuántas filas tiene el detalle completo. */
  rowCount: number;
  charts: ReportChart[];
}

/** Una página del detalle de un reporte (ver `utils/paginate.ts`). */
export type ReportRowsPage = PageOf<ReportResult['rows'][number]>;

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
