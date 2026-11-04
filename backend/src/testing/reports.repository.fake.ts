import type {
  DebtsReportData,
  DecimalLike,
  ReportFilter,
  SaleLineData,
  SaleReportData,
  SalesReportData,
} from '../types/reports.js';
import { TEST_BUSINESS_ID } from './fake-session.js';

/** Importe como lo entrega Prisma (`Decimal`): solo importa `toFixed`. */
export const decimal = (value: string): DecimalLike => ({
  toFixed: (digits) => Number(value).toFixed(digits),
});

interface LineInput {
  code: string;
  name?: string;
  category?: string;
  quantity: number;
  price: string;
  cost: string;
  /** Una devolución por elemento. */
  returned?: number[];
}

/** Línea de venta; el `productId` es el código para identificar el producto en las pruebas. */
export function line(input: LineInput): SaleLineData {
  return {
    productId: input.code,
    quantity: input.quantity,
    unitPrice: decimal(input.price),
    unitCost: decimal(input.cost),
    product: {
      code: input.code,
      name: input.name ?? `Producto ${input.code}`,
      category: { name: input.category ?? 'General' },
    },
    adjustments: (input.returned ?? []).map((quantity) => ({ quantity })),
  };
}

interface SaleInput {
  id: string;
  number: number;
  /** Instante ISO (UTC). */
  at: string;
  payment?: SaleReportData['paymentMethod'];
  customerId?: string | null;
  total: string;
  /** Abonos ligados a ESTA venta. */
  payments?: { customerId: string; amount: string }[];
  items: SaleLineData[];
}

export function sale(input: SaleInput): SaleReportData {
  return {
    id: input.id,
    number: input.number,
    createdAt: new Date(input.at),
    paymentMethod: input.payment ?? 'CASH',
    customerId: input.customerId ?? null,
    total: decimal(input.total),
    creditPayments: (input.payments ?? []).map((payment) => ({
      customerId: payment.customerId,
      amount: decimal(payment.amount),
    })),
    items: input.items,
  };
}

/** Doble del `ReportsRepository`: devuelve datos fijos y recuerda con qué filtros se le consultó. */
export class FakeReportsRepository {
  salesCalls: { filter: ReportFilter; start: Date; end: Date }[] = [];
  debtsCalls = 0;

  constructor(
    readonly businessId: string = TEST_BUSINESS_ID,
    public salesData: SalesReportData = {
      businessName: 'Negocio de prueba',
      categoryName: null,
      sales: [],
    },
    public debtsData: DebtsReportData = { businessName: 'Negocio de prueba', customers: [] },
    public categories: { id: string; name: string }[] = [],
  ) {}

  options() {
    return Promise.resolve({ categories: this.categories });
  }

  sales(filter: ReportFilter, start: Date, end: Date) {
    this.salesCalls.push({ filter, start, end });

    return Promise.resolve(this.salesData);
  }

  debts() {
    this.debtsCalls += 1;

    return Promise.resolve(this.debtsData);
  }
}
