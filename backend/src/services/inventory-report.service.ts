import type { ExpirationAlertDto, LowStockAlertDto } from '../types/inventory.js';
import type { ProductDto } from '../types/products.js';
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

/** Mismo orden que la pantalla (`frontend/src/features/reports/inventory-report.ts`). */
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
