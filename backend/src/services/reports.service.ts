import type { ReportsRepository } from '../repositories/reports.repository.js';
import type {
  DebtCustomerData,
  ReportColumn,
  ReportFilter,
  ReportKind,
  ReportOptions,
  ReportResult,
  SalesReportData,
} from '../types/reports.js';
import { businessDayRange, formatBusinessDateTime } from '../utils/dates.js';
import { HttpError } from '../utils/http-error.js';
import { formatCents, toCents } from '../utils/money.js';
import { creditPosition } from './credit.js';
import { cents, isCreditSaleCollected, lineAmounts, toEffectiveLines } from './reports.lines.js';

const TITLES: Record<ReportKind, string> = {
  sales: 'Reporte de ventas',
  profits: 'Reporte de ganancias',
  'top-products': 'Productos más vendidos',
  'customer-debts': 'Deudas de clientes',
};

const PERIOD_NOTICE =
  'Las fechas son días de Costa Rica y ambos extremos están incluidos. Una venta pertenece al período en que se hizo: una devolución posterior ajusta la venta original, no el día en que se devolvió. Las ventas anuladas no cuentan.';

const CATALOG_NOTICE =
  'Precios y costos son los HISTÓRICOS de cada venta. Código, nombre y categoría son los ACTUALES del producto: el sistema no guarda la categoría que tenía al vender, así que una venta antigua aparece en la categoría que el producto tiene hoy.';

const PAYMENT_LABELS = { CASH: 'Efectivo', CARD: 'Tarjeta', CREDIT: 'Fiado cobrado' } as const;

const column = (key: string, label: string, money = false): ReportColumn => ({ key, label, money });

const price = (value: string): string => formatCents(toCents(value));

/** Reportes comerciales del negocio (HU-28 ventas, HU-29 ganancias, HU-30 productos y deudas). */
export class ReportsService {
  constructor(private readonly repository: ReportsRepository) {}

  options(): Promise<ReportOptions> {
    return this.repository.options();
  }

  /** HU-28: ventas del período, con filtros opcionales de categoría y precio. */
  async sales(filter: ReportFilter): Promise<ReportResult> {
    const data = await this.loadSales(filter);
    const report = this.begin('sales', data.businessName);
    const transactions = new Set<string>();
    let original = 0n;
    let returned = 0n;
    let net = 0n;
    let units = 0;

    for (const sale of data.sales) {
      for (const line of toEffectiveLines(sale)) {
        const amounts = lineAmounts(line);

        original += amounts.original;
        returned += amounts.returned;
        net += amounts.net;
        units += line.netUnits;

        // Una venta con varias líneas es UNA transacción; si todo se devolvió, ya no es venta.
        if (line.netUnits > 0) {
          transactions.add(sale.id);
        }

        report.rows.push({
          sale: `#${line.saleNumber}`,
          date: formatBusinessDateTime(line.soldAt),
          code: line.code,
          product: line.name,
          category: line.category,
          price: formatCents(line.unitPrice),
          soldUnits: line.soldUnits,
          returnedUnits: line.returnedUnits,
          netUnits: line.netUnits,
          original: formatCents(amounts.original),
          returned: formatCents(amounts.returned),
          net: formatCents(amounts.net),
        });
      }
    }

    report.filters = [
      ...periodFilters(filter),
      { label: 'Categoría actual', value: data.categoryName ?? 'Todas' },
      {
        label: 'Precio mínimo',
        value: filter.minPrice === undefined ? 'Sin mínimo' : price(filter.minPrice),
      },
      {
        label: 'Precio máximo',
        value: filter.maxPrice === undefined ? 'Sin máximo' : price(filter.maxPrice),
      },
    ];
    report.notices = [
      PERIOD_NOTICE,
      CATALOG_NOTICE,
      'El filtro de precio se aplica al precio histórico de cada línea y el de categoría a la categoría actual del producto. Los importes suman solo las líneas que cumplen los filtros.',
      'Incluye ventas al contado y fiadas: es lo vendido, no lo cobrado (para lo cobrado, vea el reporte de ganancias).',
    ];
    report.columns = [
      column('sale', 'Venta'),
      column('date', 'Fecha (Costa Rica)'),
      column('code', 'Código'),
      column('product', 'Producto'),
      column('category', 'Categoría actual'),
      column('price', 'Precio histórico', true),
      column('soldUnits', 'Vendidas'),
      column('returnedUnits', 'Devueltas'),
      column('netUnits', 'Netas'),
      column('original', 'Importe original', true),
      column('returned', 'Devuelto', true),
      column('net', 'Importe neto', true),
    ];
    report.totals = [
      { label: 'Total vendido (neto)', value: formatCents(net), money: true },
      { label: 'Transacciones', value: transactions.size },
      { label: 'Unidades netas', value: units },
      { label: 'Importe original', value: formatCents(original), money: true },
      { label: 'Devuelto', value: formatCents(returned), money: true },
    ];
    report.emptyMessage = 'No hay ventas que coincidan con los filtros seleccionados.';

    return report;
  }

  /** HU-29: ganancia bruta de lo vendido y cobrado en el período. */
  async profits(filter: ReportFilter): Promise<ReportResult> {
    const data = await this.loadSales(filter);
    const report = this.begin('profits', data.businessName);
    const considered = new Set<string>();
    let revenue = 0n;
    let costs = 0n;
    let excludedSales = 0;
    let excludedAmount = 0n;

    for (const sale of data.sales) {
      if (!isCreditSaleCollected(sale)) {
        excludedSales += 1;
        excludedAmount += cents(sale.total);
        continue;
      }

      for (const line of toEffectiveLines(sale)) {
        if (line.netUnits === 0) {
          continue;
        }

        const amounts = lineAmounts(line);

        considered.add(sale.id);
        revenue += amounts.net;
        costs += amounts.cost;
        report.rows.push({
          sale: `#${line.saleNumber}`,
          date: formatBusinessDateTime(line.soldAt),
          code: line.code,
          product: line.name,
          payment: PAYMENT_LABELS[line.paymentMethod],
          netUnits: line.netUnits,
          price: formatCents(line.unitPrice),
          unitCost: formatCents(line.unitCost),
          revenue: formatCents(amounts.net),
          cost: formatCents(amounts.cost),
          profit: formatCents(amounts.profit),
        });
      }
    }

    report.filters = periodFilters(filter);
    report.notices = [
      PERIOD_NOTICE,
      'Ganancia bruta = (precio histórico − costo histórico) × unidades netas (vendidas − devueltas). No descuenta gastos operativos ni impuestos.',
      'Contado y tarjeta se cuentan al vender. Un fiado SOLO se cuenta cuando está completamente pagado con abonos aplicados a esa venta (HU-19 reparte cada abono entre los fiados más antiguos primero). Los fiados sin pagar o con pago PARCIAL quedan fuera: un pago parcial no dice qué productos cubrió, así que no se reparte su ganancia por estimación. Los abonos anteriores a HU-19 sin venta asignada no se atribuyen a ningún fiado.',
      'Este reporte NO es el total cobrado en el período: el período es el de la VENTA, no el del cobro. Un fiado liquidado después aparece en el período en que se vendió, y los cobros parciales de fiados que siguen pendientes no se suman.',
      'LIMITACIÓN (costos): el modelo no distingue un costo desconocido de un costo igual a cero. Un costo 0 se toma como válido; si una venta se registró sin costo real, su ganancia aparecerá inflada y el sistema no puede detectarlo.',
    ];
    report.columns = [
      column('sale', 'Venta'),
      column('date', 'Fecha (Costa Rica)'),
      column('code', 'Código'),
      column('product', 'Producto'),
      column('payment', 'Pago'),
      column('netUnits', 'Unidades netas'),
      column('price', 'Precio histórico', true),
      column('unitCost', 'Costo histórico', true),
      column('revenue', 'Ingresos', true),
      column('cost', 'Costos', true),
      column('profit', 'Ganancia bruta', true),
    ];
    report.totals = [
      { label: 'Ganancia bruta', value: formatCents(revenue - costs), money: true },
      { label: 'Ingresos considerados', value: formatCents(revenue), money: true },
      { label: 'Costos correspondientes', value: formatCents(costs), money: true },
      { label: 'Ventas consideradas', value: considered.size },
      { label: 'Fiados excluidos (pendientes)', value: excludedSales },
      { label: 'Monto de fiados excluidos', value: formatCents(excludedAmount), money: true },
    ];
    report.emptyMessage = 'No hay ventas cobradas verificables en el período seleccionado.';

    return report;
  }

  /** HU-30 A: ranking de productos por unidades netas vendidas. */
  async topProducts(filter: ReportFilter): Promise<ReportResult> {
    const data = await this.loadSales(filter);
    const report = this.begin('top-products', data.businessName);
    const ranking = new Map<
      string,
      { code: string; name: string; category: string; units: number; amount: bigint }
    >();
    let units = 0;
    let revenue = 0n;

    for (const sale of data.sales) {
      for (const line of toEffectiveLines(sale)) {
        if (line.netUnits === 0) {
          continue;
        }

        const amount = lineAmounts(line).net;
        const entry = ranking.get(line.productId) ?? {
          code: line.code,
          name: line.name,
          category: line.category,
          units: 0,
          amount: 0n,
        };

        entry.units += line.netUnits;
        entry.amount += amount;
        ranking.set(line.productId, entry);
        units += line.netUnits;
        revenue += amount;
      }
    }

    // Más unidades primero; ante un empate, por código (único en el negocio): orden estable.
    report.rows = [...ranking.values()]
      .sort((a, b) => b.units - a.units || a.code.localeCompare(b.code, 'es'))
      .map((entry, index) => ({
        position: index + 1,
        code: entry.code,
        product: entry.name,
        category: entry.category,
        units: entry.units,
        amount: formatCents(entry.amount),
      }));
    report.filters = periodFilters(filter);
    report.notices = [
      PERIOD_NOTICE,
      CATALOG_NOTICE,
      'Se cuentan las unidades netas (vendidas − devueltas) de ventas al contado y fiadas. Los productos desactivados aparecen mientras tengan ventas en el período.',
    ];
    report.columns = [
      column('position', 'Posición'),
      column('code', 'Código'),
      column('product', 'Producto'),
      column('category', 'Categoría actual'),
      column('units', 'Unidades vendidas'),
      column('amount', 'Importe neto', true),
    ];
    report.totals = [
      { label: 'Productos distintos', value: ranking.size },
      { label: 'Unidades netas', value: units },
      { label: 'Importe neto', value: formatCents(revenue), money: true },
    ];
    report.emptyMessage = 'No hay productos vendidos en el período seleccionado.';

    return report;
  }

  /** HU-30 B: deudas pendientes por cliente, calculadas al momento de consultar. */
  async customerDebts(): Promise<ReportResult> {
    const data = await this.repository.debts();
    const report = this.begin('customer-debts', data.businessName);
    let total = 0n;
    let debtors = 0;

    for (const customer of data.customers) {
      const debt = debtOf(customer);

      if (debt === null) {
        continue;
      }

      debtors += 1;
      total += debt.balance;
      report.rows.push(...debt.rows);
    }

    report.filters = [{ label: 'Corte', value: 'Saldos al momento de consultar' }];
    report.notices = [
      'Saldo del cliente = ventas a crédito vigentes (sin anulaciones ni unidades devueltas) − todos sus abonos. Se calcula con las operaciones reales cada vez que se abre el reporte; no se guarda otro saldo. Se incluyen clientes inactivos.',
      'El monto pendiente de un fiado descuenta los abonos aplicados a esa venta: HU-19 reparte cada abono entre los fiados más antiguos primero. Los abonos anteriores a HU-19 que no tienen venta asignada no se reparten porque no hay un criterio verificable: aparecen en una línea aparte para que el saldo acumulado siempre cuadre con el saldo real del cliente.',
      'Los abonos se registran en Clientes › Registrar abono; este reporte los lee cada vez que se consulta y nunca supone que un fiado está pagado.',
    ];
    report.columns = [
      column('customer', 'Cliente'),
      column('sale', 'Fiado'),
      column('date', 'Fecha del fiado (Costa Rica)'),
      column('amount', 'Monto del fiado', true),
      column('paid', 'Abonado a este fiado', true),
      column('pending', 'Monto pendiente', true),
      column('balance', 'Saldo acumulado del cliente', true),
    ];
    report.totals = [
      { label: 'Total general de deudas', value: formatCents(total), money: true },
      { label: 'Clientes con deuda', value: debtors },
    ];
    report.emptyMessage = 'No hay clientes con deudas pendientes.';

    return report;
  }

  private begin(kind: ReportKind, businessName: string): ReportResult {
    return {
      kind,
      title: TITLES[kind],
      businessName,
      generatedAt: new Date().toISOString(),
      filters: [],
      notices: [],
      columns: [],
      rows: [],
      totals: [],
      emptyMessage: '',
    };
  }

  private async loadSales(filter: ReportFilter): Promise<SalesReportData> {
    const { start, end } = businessDayRange(filter.from, filter.to);
    const data = await this.repository.sales(filter, start, end);

    if (filter.categoryId !== undefined && data.categoryName === null) {
      throw HttpError.notFound('La categoría no existe.');
    }

    return data;
  }
}

function periodFilters(filter: ReportFilter) {
  return [
    { label: 'Desde', value: filter.from },
    { label: 'Hasta', value: filter.to },
  ];
}

/**
 * Deuda de un cliente: sus fiados con saldo pendiente y, si hay abonos que no se
 * pueden asignar a un fiado, una línea que los descuenta. `null` si no debe nada.
 *
 * El saldo es el MISMO que el de `CustomersService` (`creditBalance`): ventas a
 * crédito vigentes (`Sale.total` ya descuenta devoluciones y anulaciones) menos
 * todos los abonos.
 */
function debtOf(
  customer: DebtCustomerData,
): { balance: bigint; rows: ReportResult['rows'] } | null {
  // La MISMA cuenta que la ficha del cliente (HU-19): una sola fuente de verdad.
  const position = creditPosition(
    customer.sales.map((sale) => ({
      id: sale.id,
      number: sale.number,
      createdAt: sale.createdAt,
      effective: cents(sale.total),
      original: cents(sale.total),
    })),
    customer.creditPayments.map((payment) => ({
      saleId: payment.saleId,
      amount: cents(payment.amount),
    })),
  );
  const balance = position.balance;

  if (balance <= 0n) {
    return null;
  }

  const rows: ReportResult['rows'] = [];
  let running = 0n;

  for (const fiado of position.fiados) {
    if (fiado.pending === 0n) {
      continue;
    }

    running += fiado.pending;
    rows.push({
      customer: customer.name,
      sale: `#${fiado.number}`,
      date: formatBusinessDateTime(fiado.createdAt),
      amount: formatCents(fiado.effective),
      paid: formatCents(fiado.paid > fiado.effective ? fiado.effective : fiado.paid),
      pending: formatCents(fiado.pending),
      balance: formatCents(running),
    });
  }

  // Nunca es positivo: lo que falta para llegar al saldo real son abonos sin venta asignada.
  const unassigned = balance - running;

  if (unassigned !== 0n) {
    rows.push({
      customer: customer.name,
      sale: 'Abonos sin venta asignada',
      date: '—',
      amount: '',
      paid: formatCents(-unassigned),
      pending: formatCents(unassigned),
      balance: formatCents(balance),
    });
  }

  return { balance, rows };
}
