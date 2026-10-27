import { randomUUID } from 'node:crypto';
import type { CustomersRepository } from '../repositories/customers.repository.js';
import type { SalesRepository } from '../repositories/sales.repository.js';
import type {
  CreateCustomerFields,
  CreateSaleOutcome,
  CreateSalePlan,
  CreditTotals,
  DailySalesSummaryDto,
  CustomerRef,
  SaleAdjustmentOutcome,
  SaleAdjustmentPlan,
  SaleListFilter,
  SaleProductDto,
  SaleRecord,
  SaleSummaryDto,
} from '../types/sales.js';
import { formatCents, toCents } from '../utils/money.js';

/** Dobles de repositorio de ventas y clientes para los tests (sin base de datos). */

export const COFFEE_ID = '11111111-1111-4111-8111-111111111111';
export const RICE_ID = '11111111-2222-4222-8222-222222222222';
export const OFF_ID = '11111111-3333-4333-8333-333333333333';
export const CUSTOMER_ID = '44444444-1111-4111-8111-111111111111';
export const INACTIVE_CUSTOMER_ID = '44444444-2222-4222-8222-222222222222';
export const MISSING_ID = '99999999-9999-4999-8999-999999999999';
export const KEY = '55555555-5555-4555-8555-555555555555';

export function buildSaleProduct(overrides: Partial<SaleProductDto> = {}): SaleProductDto {
  return {
    id: COFFEE_ID,
    code: 'P001',
    barcode: '7501000000012',
    name: 'Café molido 500 g',
    price: '1500.00',
    stock: 10,
    isActive: true,
    ...overrides,
  };
}

export class FakeSalesRepository implements SalesRepository {
  /** Planes recibidos por `createSale`. */
  readonly plans: CreateSalePlan[] = [];
  /** Fuerza un rechazo del repositorio (p. ej. otra venta se llevó el stock). */
  rejectWith: 'INSUFFICIENT_STOCK' | 'PRICE_CHANGED' | 'UNAVAILABLE' | null = null;

  readonly sales: SaleRecord[] = [];
  private readonly keys = new Map<string, SaleRecord>();
  private readonly products: SaleProductDto[];
  private readonly customers: CustomerRef[];

  constructor(
    products: SaleProductDto[] = [
      buildSaleProduct(),
      buildSaleProduct({
        id: RICE_ID,
        code: 'P002',
        barcode: null,
        name: 'Arroz 1 kg',
        price: '900.00',
        stock: 5,
      }),
      buildSaleProduct({
        id: OFF_ID,
        code: 'P003',
        barcode: null,
        name: 'Descontinuado',
        isActive: false,
      }),
    ],
    customers: CustomerRef[] = [
      { id: CUSTOMER_ID, name: 'Doña Marta', isActive: true },
      { id: INACTIVE_CUSTOMER_ID, name: 'Don Inactivo', isActive: false },
    ],
  ) {
    this.products = products.map((product) => ({ ...product }));
    this.customers = customers;
  }

  findProductByCode(code: string): Promise<SaleProductDto | null> {
    return Promise.resolve(
      this.products.find((product) => product.code === code || product.barcode === code) ?? null,
    );
  }

  findProductsByIds(ids: string[]): Promise<SaleProductDto[]> {
    return Promise.resolve(this.products.filter((product) => ids.includes(product.id)));
  }

  findCustomerRef(id: string): Promise<CustomerRef | null> {
    return Promise.resolve(this.customers.find((customer) => customer.id === id) ?? null);
  }

  findById(id: string): Promise<SaleRecord | null> {
    return Promise.resolve(this.sales.find((sale) => sale.id === id) ?? null);
  }

  list(filter: SaleListFilter): Promise<SaleSummaryDto[]> {
    return Promise.resolve(
      this.sales
        .filter(
          (sale) =>
            filter.paymentMethod === undefined || sale.paymentMethod === filter.paymentMethod,
        )
        .slice(0, filter.limit)
        .map((sale) => ({
          id: sale.id,
          number: sale.number,
          createdAt: sale.createdAt,
          paymentMethod: sale.paymentMethod,
          status: sale.status,
          total: sale.total,
          customerName: sale.customer?.name ?? null,
          itemCount: sale.items.length,
        })),
    );
  }

  adjustSale(plan: SaleAdjustmentPlan): Promise<SaleAdjustmentOutcome> {
    const sale = this.sales.find((candidate) => candidate.id === plan.saleId);

    if (sale === undefined) {
      return Promise.resolve({ ok: false, reason: 'NOT_FOUND' });
    }

    if (sale.status === 'VOID') {
      return Promise.resolve({ ok: false, reason: 'ALREADY_VOID' });
    }

    if (sale.status === 'RETURNED') {
      return Promise.resolve({ ok: false, reason: 'ALREADY_RETURNED' });
    }

    const availableByItem = new Map(
      sale.items.map((item) => [
        item.id,
        item.quantity -
          sale.adjustments.reduce(
            (sum, adjustment) =>
              sum +
              adjustment.items
                .filter((adjustedItem) => adjustedItem.saleItemId === item.id)
                .reduce((itemSum, adjustedItem) => itemSum + adjustedItem.quantity, 0),
            0,
          ),
      ]),
    );
    const selected =
      plan.type === 'VOID'
        ? sale.items
            .map((item) => ({ saleItemId: item.id, quantity: availableByItem.get(item.id) ?? 0 }))
            .filter((item) => item.quantity > 0)
        : (plan.items ?? []);

    if (selected.length === 0) {
      return Promise.resolve({ ok: false, reason: 'ALREADY_RETURNED' });
    }

    let adjustmentCents = 0n;
    const adjustmentItems: { saleItemId: string; productId: string; quantity: number }[] = [];

    for (const requested of selected) {
      const item = sale.items.find((candidate) => candidate.id === requested.saleItemId);

      if (item === undefined) {
        return Promise.resolve({ ok: false, reason: 'INVALID_ITEM' });
      }

      if (requested.quantity > (availableByItem.get(item.id) ?? 0)) {
        return Promise.resolve({ ok: false, reason: 'QUANTITY_EXCEEDED' });
      }

      adjustmentCents += toCents(item.unitPrice) * BigInt(requested.quantity);
      adjustmentItems.push({
        saleItemId: item.id,
        productId: item.productId,
        quantity: requested.quantity,
      });
    }

    for (const item of adjustmentItems) {
      const product = this.products.find((candidate) => candidate.id === item.productId);

      if (product === undefined) {
        throw new Error('Producto de devolución inexistente');
      }

      product.stock += item.quantity;
    }

    sale.adjustments.push({
      id: randomUUID(),
      type: plan.type,
      reason: plan.reason,
      total: formatCents(adjustmentCents),
      createdAt: new Date().toISOString(),
      items: adjustmentItems.map((item) => ({
        saleItemId: item.saleItemId,
        productName: sale.items.find((saleItem) => saleItem.id === item.saleItemId)?.name ?? '',
        quantity: item.quantity,
      })),
    });
    sale.total = formatCents(toCents(sale.total) - adjustmentCents);

    const allReturned = sale.items.every((item) => {
      const returnedBefore = item.quantity - (availableByItem.get(item.id) ?? 0);
      const returnedNow =
        adjustmentItems.find((adjustmentItem) => adjustmentItem.saleItemId === item.id)?.quantity ??
        0;

      return returnedBefore + returnedNow >= item.quantity;
    });
    sale.status = plan.type === 'VOID' ? 'VOID' : allReturned ? 'RETURNED' : 'PARTIALLY_RETURNED';
    sale.items = sale.items.map((item) => {
      const returnedQuantity =
        item.quantity -
        (availableByItem.get(item.id) ?? 0) +
        (adjustmentItems.find((adjustmentItem) => adjustmentItem.saleItemId === item.id)
          ?.quantity ?? 0);

      return {
        ...item,
        returnedQuantity,
        availableQuantity: item.quantity - returnedQuantity,
      };
    });

    return Promise.resolve({ ok: true, sale });
  }

  dailySummary(startAt: Date, endAt: Date): Promise<DailySalesSummaryDto> {
    const dailySales = this.sales.filter((sale) => {
      const createdAt = new Date(sale.createdAt);

      return createdAt >= startAt && createdAt < endAt;
    });
    const centsByMethod = { CASH: 0n, CARD: 0n, CREDIT: 0n };

    for (const sale of dailySales) {
      centsByMethod[sale.paymentMethod] += toCents(sale.total);
    }

    const cash = formatCents(centsByMethod.CASH);
    const card = formatCents(centsByMethod.CARD);
    const credit = formatCents(centsByMethod.CREDIT);

    return Promise.resolve({
      saleCount: dailySales.length,
      total: formatCents(centsByMethod.CASH + centsByMethod.CARD + centsByMethod.CREDIT),
      cash,
      card,
      credit,
    });
  }

  createSale(plan: CreateSalePlan): Promise<CreateSaleOutcome> {
    const replay = this.keys.get(plan.idempotencyKey);

    if (replay !== undefined) {
      return Promise.resolve({ ok: true, sale: replay, created: false });
    }

    if (this.rejectWith !== null) {
      return Promise.resolve({ ok: false, reason: this.rejectWith, productId: COFFEE_ID });
    }

    this.plans.push(plan);

    const customer = this.customers.find((candidate) => candidate.id === plan.customerId);
    const sale: SaleRecord = {
      id: `66666666-6666-4666-8666-${String(this.sales.length + 1).padStart(12, '0')}`,
      number: this.sales.length + 1,
      createdAt: new Date().toISOString(),
      paymentMethod: plan.paymentMethod,
      status: 'COMPLETED',
      total: plan.total,
      originalTotal: plan.total,
      cashReceived: plan.cashReceived,
      customer: customer === undefined ? null : { id: customer.id, name: customer.name },
      items: plan.items.map((item) => {
        const product = this.products.find((candidate) => candidate.id === item.productId);

        if (product === undefined) {
          throw new Error('Producto de prueba inexistente');
        }

        product.stock -= item.quantity;

        return {
          id: randomUUID(),
          productId: item.productId,
          code: product.code,
          name: product.name,
          quantity: item.quantity,
          returnedQuantity: 0,
          availableQuantity: item.quantity,
          unitPrice: item.expectedUnitPrice,
          subtotal: formatCents(toCents(item.expectedUnitPrice) * BigInt(item.quantity)),
        };
      }),
      adjustments: [],
    };

    this.sales.push(sale);
    this.keys.set(plan.idempotencyKey, sale);

    return Promise.resolve({ ok: true, sale, created: true });
  }

  stockOf(productId: string): number | undefined {
    return this.products.find((product) => product.id === productId)?.stock;
  }
}

export class FakeCustomersRepository implements CustomersRepository {
  readonly created: CreateCustomerFields[] = [];
  /** Totales de crédito y abonos por cliente. */
  readonly totals = new Map<string, CreditTotals>();

  constructor(private readonly sales?: FakeSalesRepository) {}

  listActive() {
    return Promise.resolve([
      { id: CUSTOMER_ID, name: 'Doña Marta', phone: null, ...this.totalsOf(CUSTOMER_ID) },
    ]);
  }

  create(fields: CreateCustomerFields) {
    this.created.push(fields);

    return Promise.resolve({ id: '44444444-3333-4333-8333-333333333333', ...fields });
  }

  findRef(id: string): Promise<CustomerRef | null> {
    return this.sales === undefined ? Promise.resolve(null) : this.sales.findCustomerRef(id);
  }

  getCreditTotals(customerId: string): Promise<CreditTotals> {
    return Promise.resolve(this.totalsOf(customerId));
  }

  /** Suma las ventas CREDIT del doble de ventas más lo configurado como crédito previo y abonos. */
  private totalsOf(customerId: string): CreditTotals {
    const base = this.totals.get(customerId) ?? { credited: '0.00', paid: '0.00' };
    const fromSales =
      this.sales?.sales
        .filter((sale) => sale.paymentMethod === 'CREDIT' && sale.customer?.id === customerId)
        .reduce((sum, sale) => sum + toCents(sale.total), 0n) ?? 0n;

    return { credited: formatCents(toCents(base.credited) + fromSales), paid: base.paid };
  }
}
