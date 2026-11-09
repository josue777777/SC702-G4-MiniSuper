import type { ExpirationAlertDto, LowStockAlertDto } from '../types/inventory.js';
import type { ProductDto } from '../types/products.js';
import type { ReportChart, ReportChartDatum } from '../types/reports.js';
import type { ProductsRepository } from '../repositories/products.repository.js';
import { toCents } from '../utils/money.js';
import type {
  InventoryReportColumn,
  InventoryReportQuery,
} from '../validators/inventory-report.validator.js';
import type { InventoryService } from './inventory.service.js';

/** Un bloque de productos: una categoría, o todos juntos (`title` en `null`). */
export interface InventoryReportGroup {
  title: string | null;
  products: ProductDto[];
}

export interface InventoryReportData {
  /** «Todas» o el nombre de la categoría elegida. */
  scope: string;
  columns: InventoryReportColumn[];
  products: ProductDto[];
  groups: InventoryReportGroup[];
  expirations: ExpirationAlertDto[] | null;
  lowStock: LowStockAlertDto[] | null;
  query: InventoryReportQuery;
}

/** Las tres secciones del detalle, cada una con sus propias filas. */
export type InventoryReportSection = 'products' | 'expirations' | 'lowStock';

/**
 * Lo que la pantalla necesita para mostrar el reporte de inventario: totales,
 * gráficos y cuántas filas tiene cada sección, SIN las filas. Las filas se
 * piden aparte, de a una página, al abrir «Ver detalle»
 * (`GET /api/reports/inventory/rows`). El PDF y el Excel llevan todas.
 */
export interface InventoryReportSummary {
  /** «Todas» o el nombre de la categoría elegida. */
  scope: string;
  generatedAt: string;
  totals: {
    /** Productos activos en el alcance. */
    count: number;
    units: number;
    /** Valor al costo (stock × costo), con dos decimales. */
    value: string;
  };
  charts: ReportChart[];
  /** Filas de cada sección; `null` si la sección no se eligió. */
  counts: { products: number; expirations: number | null; lowStock: number | null };
}

/** Columnas visibles la primera vez (igual que en pantalla); «name» siempre va. */
const DEFAULT_COLUMNS: InventoryReportColumn[] = [
  'code',
  'name',
  'category',
  'cost',
  'price',
  'stock',
  'minStock',
  'expiration',
];

const value = (product: ProductDto): bigint => toCents(product.cost) * BigInt(product.stock);

/** Orden de los productos del reporte: el mismo en pantalla, el PDF y el Excel (se ordena solo aquí). */
export function sortProducts(products: ProductDto[], sort: InventoryReportQuery['sort']) {
  const byName = (a: ProductDto, b: ProductDto) => a.name.localeCompare(b.name, 'es');
  const sorted = [...products];

  switch (sort) {
    case 'code':
      return sorted.sort((a, b) =>
        a.code.localeCompare(b.code, 'es', { numeric: true, sensitivity: 'base' }),
      );
    case 'name':
      return sorted.sort(byName);
    case 'stockAsc':
      return sorted.sort((a, b) => a.stock - b.stock || byName(a, b));
    case 'valueDesc':
      return sorted.sort((a, b) => {
        const diff = value(b) - value(a);

        return diff > 0n ? 1 : diff < 0n ? -1 : byName(a, b);
      });
    default:
      return sorted.sort(
        (a, b) => a.categoryName.localeCompare(b.categoryName, 'es') || byName(a, b),
      );
  }
}

/**
 * Reporte de inventario para exportar (HU-25 con stock bajo de HU-08 y
 * vencimientos de HU-09; HU-40): el MISMO que se ve en Reportes › Inventario.
 * Siempre productos ACTIVOS; vencimientos y stock bajo respetan la categoría.
 */
export class InventoryReportService {
  constructor(
    private readonly products: ProductsRepository,
    private readonly inventory: InventoryService,
  ) {}

  async build(query: InventoryReportQuery): Promise<InventoryReportData> {
    const all = await this.products.list({ categoryId: query.categoryId, activeOnly: true });
    const products = sortProducts(all, query.sort);
    const inScope = new Set(products.map((product) => product.id));
    const sections = new Set(query.sections);
    const columns = query.columns ?? DEFAULT_COLUMNS;
    const groups: InventoryReportGroup[] =
      query.grouped && query.categoryId === undefined
        ? groupByCategory(products)
        : [{ title: null, products }];

    return {
      scope:
        query.categoryId === undefined ? 'Todas' : (products[0]?.categoryName ?? 'Sin productos'),
      // Sin el nombre la fila no se entiende: siempre se incluye.
      columns: columns.includes('name') ? columns : ['name', ...columns],
      products,
      groups,
      expirations: sections.has('expirations')
        ? (await this.inventory.listExpirations()).filter(
            (alert) =>
              inScope.has(alert.productId) &&
              (query.expirations === 'ALL' || alert.status === query.expirations),
          )
        : null,
      lowStock: sections.has('lowStock')
        ? (await this.inventory.listLowStockAlerts()).filter((alert) =>
            inScope.has(alert.productId),
          )
        : null,
      query,
    };
  }
}

function groupByCategory(products: ProductDto[]): InventoryReportGroup[] {
  const groups = new Map<string, InventoryReportGroup>();

  for (const product of products) {
    const group = groups.get(product.categoryId) ?? { title: product.categoryName, products: [] };

    group.products.push(product);
    groups.set(product.categoryId, group);
  }

  return [...groups.values()].sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '', 'es'));
}

/** Céntimos (`bigint`) a colones con dos decimales, sin pasar por coma flotante. */
function centsToMoney(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const absolute = cents < 0n ? -cents : cents;

  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

/** Valor al costo por categoría, de mayor a menor: dónde está el dinero invertido. */
export function valueByCategory(products: readonly ProductDto[]): ReportChartDatum[] {
  const totals = new Map<string, bigint>();

  for (const product of products) {
    totals.set(product.categoryName, (totals.get(product.categoryName) ?? 0n) + value(product));
  }

  return [...totals.entries()]
    .map(([label, cents]) => ({ key: label, label, value: Number(cents) / 100 }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'es'));
}

/** Cuántos productos hay con stock suficiente, en su mínimo (o debajo) y agotados. */
export function stockStatus(products: readonly ProductDto[]): ReportChartDatum[] {
  const out = products.filter((product) => product.stock === 0).length;
  const atMinimum = products.filter(
    (product) => product.stock > 0 && product.minStock > 0 && product.stock <= product.minStock,
  ).length;

  return [
    { key: 'ok', label: 'Con stock suficiente', value: products.length - out - atMinimum },
    { key: 'min', label: 'En su mínimo o debajo', value: atMinimum },
    { key: 'out', label: 'Agotados', value: out },
  ];
}

/** El resumen del reporte: se calcula con TODOS los productos y no lleva filas. */
export function summarizeInventory(
  data: InventoryReportData,
  generatedAt: Date = new Date(),
): InventoryReportSummary {
  const { products } = data;
  const units = products.reduce((sum, product) => sum + product.stock, 0);
  const cents = products.reduce((sum, product) => sum + value(product), 0n);

  return {
    scope: data.scope,
    generatedAt: generatedAt.toISOString(),
    totals: { count: products.length, units, value: centsToMoney(cents) },
    charts:
      products.length === 0
        ? []
        : [
            {
              id: 'inventory-value',
              title: 'Valor del inventario por categoría',
              subtitle: 'Stock × precio de compra: dónde está el dinero invertido.',
              form: 'bars',
              unit: 'money',
              data: valueByCategory(products),
            },
            {
              id: 'inventory-status',
              title: 'Estado del stock',
              subtitle: 'Cuántos productos activos hay en cada situación.',
              form: 'bars',
              unit: 'products',
              data: stockStatus(products),
            },
          ],
    counts: {
      products: products.length,
      expirations: data.expirations?.length ?? null,
      lowStock: data.lowStock?.length ?? null,
    },
  };
}

/** Las filas de una sección, en el orden del reporte. */
export function sectionRows(
  data: InventoryReportData,
  section: InventoryReportSection,
): readonly (ProductDto | ExpirationAlertDto | LowStockAlertDto)[] {
  switch (section) {
    case 'products':
      return data.products;
    case 'expirations':
      return data.expirations ?? [];
    case 'lowStock':
      return data.lowStock ?? [];
  }
}
