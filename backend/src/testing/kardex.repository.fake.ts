import type { IncomingLot } from '../repositories/stock-entries.js';
import type {
  KardexDirection,
  KardexMovementKind,
  KardexMovementRow,
  KardexProductOption,
  KardexProductRow,
  KardexStockLotRow,
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
    maxStock: 0,
    unit: 'UD',
    description: null,
    perishable: false,
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
  documentNumber?: string | null;
  detail?: string | null;
  exitLot?: KardexMovementRow['exitLot'];
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
    documentNumber: input.documentNumber ?? null,
    detail: input.detail ?? null,
    exitLot: input.exitLot ?? null,
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
  /** Lotes con unidades por producto (lo que ofrece el egreso). */
  stockLots = new Map<string, KardexStockLotRow[]>();
  /** Proveedores activos del negocio. */
  activeSuppliers = new Set<string>();
  /** Lo que el service encargó escribir. */
  entries: { productId: string; lots: IncomingLot[]; movement: Record<string, unknown> }[] = [];
  exits: { productId: string; plan: Record<string, unknown> }[] = [];
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

  listMovements(productId: string, skip: number, take: number, direction: KardexDirection = 'all') {
    const all = this.filtered(productId, direction).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
    );

    return Promise.resolve({ rows: all.slice(skip, skip + take), total: all.length });
  }

  /** Movimientos del producto con el filtro «Entradas» / «Salidas», como la base. */
  filtered(productId: string, direction: KardexDirection) {
    return [...(this.movements.get(productId) ?? [])].filter((row) => {
      const up =
        row.type === 'ENTRY' || (row.type === 'ADJUSTMENT' && row.stockAfter > row.stockBefore);
      const down =
        row.type === 'EXIT' || (row.type === 'ADJUSTMENT' && row.stockAfter < row.stockBefore);

      return direction === 'all' || (direction === 'entries' ? up : down);
    });
  }

  listProductAmounts(productId: string, direction: KardexDirection = 'all') {
    return Promise.resolve(this.filtered(productId, direction));
  }

  listStockLots(productId: string) {
    return Promise.resolve(this.stockLots.get(productId) ?? []);
  }

  supplierIsActive(supplierId: string) {
    return Promise.resolve(this.activeSuppliers.has(supplierId));
  }

  addDirectEntry(productId: string, lots: IncomingLot[], movement: Record<string, unknown>) {
    this.entries.push({ productId, lots, movement });

    return Promise.resolve();
  }

  registerExit(productId: string, plan: Record<string, unknown>) {
    this.exits.push({ productId, plan });

    return Promise.resolve();
  }

  /** Todos los movimientos de todos los productos, con su producto, como la base. */
  allMovements() {
    return [...this.movements.entries()]
      .flatMap(([productId, rows]) => {
        const product = this.products.get(productId);

        return rows.map((row) => ({
          ...row,
          product: { id: productId, code: product?.code ?? '?', name: product?.name ?? '?' },
        }));
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
  }

  listRecentMovements(skip: number, take: number) {
    const all = this.allMovements();

    return Promise.resolve({ rows: all.slice(skip, skip + take), total: all.length });
  }

  listAmountsBetween(start: Date, end: Date) {
    return Promise.resolve(
      this.allMovements().filter((row) => row.createdAt >= start && row.createdAt < end),
    );
  }
}
