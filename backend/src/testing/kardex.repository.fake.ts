import type {
  KardexMovementKind,
  KardexMovementRow,
  KardexProductOption,
  KardexProductRow,
} from '../types/kardex.js';
import { TEST_BUSINESS_ID } from './fake-session.js';

export const KARDEX_PRODUCT_ID = '0a1b2c3d-0000-4000-8000-000000000001';
export const KARDEX_EMPTY_PRODUCT_ID = '0a1b2c3d-0000-4000-8000-000000000002';
export const KARDEX_FOREIGN_PRODUCT_ID = '0a1b2c3d-0000-4000-8000-0000000000ff';

/** Importe como lo entrega Prisma (`Decimal`): solo importa `toFixed`. */
const decimal = (value: string) => ({ toFixed: (digits: number) => Number(value).toFixed(digits) });

export function kardexProduct(overrides: Partial<KardexProductRow> = {}): KardexProductRow {
  return {
    id: KARDEX_PRODUCT_ID,
    code: 'P001',
    barcode: '7501000000012',
    name: 'Café molido 500 g',
    price: decimal('1500'),
    cost: decimal('1000.5'),
    stock: 8,
    minStock: 3,
    expirationDate: null,
    isActive: true,
    category: { name: 'Bebidas' },
    supplierProducts: [{ supplier: { name: 'Distribuidora Central' } }],
    ...overrides,
  };
}

interface MovementInput {
  id: string;
  type: KardexMovementKind;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  /** Instante ISO (UTC). */
  at: string;
  reason?: string | null;
  sale?: { id: string; number: number } | null;
  purchaseOrder?: { id: string; number: number } | null;
  receipt?: { invoiceNumber: string } | null;
  lots?: KardexMovementRow['lots'];
}

export function kardexMovement(input: MovementInput): KardexMovementRow {
  return {
    id: input.id,
    type: input.type,
    quantity: input.quantity,
    stockBefore: input.stockBefore,
    stockAfter: input.stockAfter,
    reason: input.reason ?? null,
    createdAt: new Date(input.at),
    sale: input.sale ?? null,
    purchaseOrder: input.purchaseOrder ?? null,
    receipt: input.receipt ?? null,
    lots: input.lots ?? [],
  };
}

/**
 * Doble del `KardexRepository`. Ordena y pagina como lo hace la base (fecha
 * descendente, desempate por id descendente) para probar el service y las rutas
 * sin PostgreSQL. Recuerda cuántas lecturas se hicieron y con qué negocio.
 */
export class FakeKardexRepository {
  products = new Map<string, KardexProductRow>();
  movements = new Map<string, KardexMovementRow[]>();
  options: KardexProductOption[] = [];
  searches: { term: string; limit: number }[] = [];

  constructor(readonly businessId: string = TEST_BUSINESS_ID) {
    this.products.set(KARDEX_PRODUCT_ID, kardexProduct());
    this.products.set(
      KARDEX_EMPTY_PRODUCT_ID,
      kardexProduct({ id: KARDEX_EMPTY_PRODUCT_ID, code: 'P002', name: 'Arroz 1 kg' }),
    );
  }

  findProduct(id: string) {
    return Promise.resolve(this.products.get(id) ?? null);
  }

  searchProducts(term: string, limit: number) {
    this.searches.push({ term, limit });

    return Promise.resolve(this.options);
  }

  listMovements(productId: string, skip: number, take: number) {
    const all = [...(this.movements.get(productId) ?? [])].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
    );

    return Promise.resolve({ rows: all.slice(skip, skip + take), total: all.length });
  }
}
