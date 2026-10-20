import type { CustomersRepository } from '../repositories/customers.repository.js';
import type { SalesRepository } from '../repositories/sales.repository.js';
import type {
  CreateCustomerFields,
  CreateSaleOutcome,
  CreateSalePlan,
  CreditTotals,
  CustomerRef,
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
          total: sale.total,
          customerName: sale.customer?.name ?? null,
          itemCount: sale.items.length,
        })),
    );
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
      createdAt: '2026-10-18T15:00:00.000Z',
      paymentMethod: plan.paymentMethod,
      total: plan.total,
      cashReceived: plan.cashReceived,
      customer: customer === undefined ? null : { id: customer.id, name: customer.name },
      items: plan.items.map((item) => {
        const product = this.products.find((candidate) => candidate.id === item.productId);

        if (product === undefined) {
          throw new Error('Producto de prueba inexistente');
        }

        product.stock -= item.quantity;

        return {
          productId: item.productId,
          code: product.code,
          name: product.name,
          quantity: item.quantity,
          unitPrice: item.expectedUnitPrice,
          subtotal: formatCents(toCents(item.expectedUnitPrice) * BigInt(item.quantity)),
        };
      }),
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
