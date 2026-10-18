import type { Product } from '../../types/products';
import { formatDateOnly } from '../inventory/inventory-count';
import { formatMoney } from './money';

/**
 * Reglas del reporte de inventario, sin React: qué columnas hay, cómo se
 * ordena, cómo se agrupa y qué se recuerda entre una impresión y otra.
 *
 * Las columnas son DATOS: agregar una columna es agregar un elemento a
 * `REPORT_COLUMNS`; la tabla, las casillas y la preferencia guardada la toman
 * de aquí.
 */

export type ReportColumnKey =
  'code' | 'name' | 'category' | 'cost' | 'price' | 'stock' | 'value' | 'minStock' | 'expiration';

export interface ReportColumn {
  key: ReportColumnKey;
  label: string;
  /** Las cifras se alinean a la derecha. */
  numeric: boolean;
  /** `true` si no se puede ocultar (sin el nombre el reporte no se entiende). */
  required?: boolean;
  /** Visible la primera vez que se abre el reporte. */
  defaultVisible: boolean;
  render: (product: Product) => string;
}

function toCents(value: string): number {
  return Math.round(Number(value) * 100);
}

/** Valor del producto en inventario al costo: stock × precio de compra. */
function stockValue(product: Product): string {
  return ((toCents(product.cost) * product.stock) / 100).toFixed(2);
}

export const REPORT_COLUMNS: ReportColumn[] = [
  { key: 'code', label: 'Código', numeric: false, defaultVisible: true, render: (p) => p.code },
  {
    key: 'name',
    label: 'Producto',
    numeric: false,
    required: true,
    defaultVisible: true,
    render: (p) => p.name,
  },
  {
    key: 'category',
    label: 'Categoría',
    numeric: false,
    defaultVisible: true,
    render: (p) => p.categoryName,
  },
  {
    key: 'cost',
    label: 'P. compra',
    numeric: true,
    defaultVisible: true,
    render: (p) => formatMoney(p.cost),
  },
  {
    key: 'price',
    label: 'P. venta',
    numeric: true,
    defaultVisible: true,
    render: (p) => formatMoney(p.price),
  },
  {
    key: 'stock',
    label: 'Stock',
    numeric: true,
    defaultVisible: true,
    render: (p) => String(p.stock),
  },
  {
    key: 'value',
    label: 'Valor en inventario',
    numeric: true,
    defaultVisible: false,
    render: (p) => formatMoney(stockValue(p)),
  },
  {
    key: 'minStock',
    label: 'Mínimo',
    numeric: true,
    defaultVisible: true,
    render: (p) => (p.minStock === 0 ? '—' : String(p.minStock)),
  },
  {
    key: 'expiration',
    label: 'Vence',
    numeric: false,
    defaultVisible: true,
    render: (p) => (p.expirationDate === null ? '—' : formatDateOnly(p.expirationDate)),
  },
];

export type ReportSort = 'category' | 'name' | 'stockAsc' | 'valueDesc';

export const REPORT_SORTS: Record<ReportSort, string> = {
  category: 'Categoría y nombre',
  name: 'Nombre',
  stockAsc: 'Stock (de menor a mayor)',
  valueDesc: 'Valor en inventario (de mayor a menor)',
};

export type ReportOrientation = 'portrait' | 'landscape';

/** Lo que el dueño elige y se recuerda para la próxima vez. */
export interface ReportPreferences {
  columns: ReportColumnKey[];
  sort: ReportSort;
  orientation: ReportOrientation;
}

export const DEFAULT_PREFERENCES: ReportPreferences = {
  columns: REPORT_COLUMNS.filter((column) => column.defaultVisible).map((column) => column.key),
  sort: 'category',
  orientation: 'portrait',
};

const STORAGE_KEY = 'minisuper.inventory-report.v1';

/**
 * Preferencias guardadas en este navegador. Si no hay, están dañadas o el
 * navegador no deja usar el almacenamiento (modo privado), se usan las de
 * fábrica: el reporte funciona igual.
 */
export function loadPreferences(): ReportPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (raw === null) {
      return DEFAULT_PREFERENCES;
    }

    const saved = JSON.parse(raw) as Partial<ReportPreferences>;
    const known = new Set(REPORT_COLUMNS.map((column) => column.key));
    const columns = (saved.columns ?? []).filter((key) => known.has(key));

    return {
      // Las obligatorias siempre van, aunque la preferencia vieja no las traiga.
      columns: withRequired(columns.length > 0 ? columns : DEFAULT_PREFERENCES.columns),
      sort: saved.sort !== undefined && saved.sort in REPORT_SORTS ? saved.sort : 'category',
      orientation: saved.orientation === 'landscape' ? 'landscape' : 'portrait',
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(preferences: ReportPreferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Sin almacenamiento disponible: solo no se recuerda; el reporte sigue igual.
  }
}

function withRequired(columns: ReportColumnKey[]): ReportColumnKey[] {
  const required = REPORT_COLUMNS.filter((column) => column.required).map((column) => column.key);

  return [...new Set([...required, ...columns])];
}

/** Columnas visibles en el orden de `REPORT_COLUMNS`. */
export function visibleColumns(keys: ReportColumnKey[]): ReportColumn[] {
  const chosen = new Set(withRequired(keys));

  return REPORT_COLUMNS.filter((column) => chosen.has(column.key));
}

export function sortProducts(products: Product[], sort: ReportSort): Product[] {
  const byName = (a: Product, b: Product) => a.name.localeCompare(b.name, 'es');
  const sorted = [...products];

  switch (sort) {
    case 'name':
      return sorted.sort(byName);
    case 'stockAsc':
      return sorted.sort((a, b) => a.stock - b.stock || byName(a, b));
    case 'valueDesc':
      return sorted.sort(
        (a, b) => toCents(b.cost) * b.stock - toCents(a.cost) * a.stock || byName(a, b),
      );
    default:
      return sorted.sort(
        (a, b) => a.categoryName.localeCompare(b.categoryName, 'es') || byName(a, b),
      );
  }
}

/** Un bloque de la tabla: una categoría, o todo junto (`title` en `null`). */
export interface ProductGroup {
  key: string;
  title: string | null;
  products: Product[];
}

/** Agrupa por categoría (en orden alfabético) y conserva el orden elegido dentro de cada una. */
export function groupByCategory(products: Product[]): ProductGroup[] {
  const groups = new Map<string, ProductGroup>();

  for (const product of products) {
    const group = groups.get(product.categoryId) ?? {
      key: product.categoryId,
      title: product.categoryName,
      products: [],
    };
    group.products.push(product);
    groups.set(product.categoryId, group);
  }

  return [...groups.values()].sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '', 'es'));
}

/** Resumen de un grupo o del total: cantidad, unidades y valor al costo. */
export function summarize(products: Product[]): string {
  const units = products.reduce((sum, product) => sum + product.stock, 0);
  const cents = products.reduce((sum, product) => sum + toCents(product.cost) * product.stock, 0);

  return `${products.length} producto(s) · ${units} unidad(es) · valor al costo ${formatMoney((cents / 100).toFixed(2))}`;
}
