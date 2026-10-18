import type { Product } from '../../types/products';
import type { PurchaseOrderSummary } from '../../types/purchase-orders';

/**
 * Cálculos del panel principal, sin React. Todo sale de datos que ya existen
 * (productos y pedidos): el panel solo los resume, no agrega reglas nuevas.
 *
 * El dinero se suma en céntimos para no arrastrar errores de punto flotante.
 */

function toCents(value: string): number {
  return Math.round(Number(value) * 100);
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Una barra del gráfico: nombre, valor en colones y su parte del total. */
export interface BarDatum {
  key: string;
  label: string;
  value: string;
  /** Porcentaje del total, de 0 a 100. */
  share: number;
}

export interface InventorySummary {
  /** Valor del inventario al costo: suma de stock × costo de los activos. */
  totalValue: string;
  activeProducts: number;
  totalUnits: number;
}

function stockValueCents(product: Product): number {
  return toCents(product.cost) * product.stock;
}

/** Solo cuentan los productos activos: los inactivos ya no se venden. */
export function summarizeInventory(products: Product[]): InventorySummary {
  const active = products.filter((product) => product.isActive);

  return {
    totalValue: fromCents(active.reduce((sum, product) => sum + stockValueCents(product), 0)),
    activeProducts: active.length,
    totalUnits: active.reduce((sum, product) => sum + product.stock, 0),
  };
}

function toBars(entries: { key: string; label: string; cents: number }[]): BarDatum[] {
  const total = entries.reduce((sum, entry) => sum + entry.cents, 0);

  return entries.map((entry) => ({
    key: entry.key,
    label: entry.label,
    value: fromCents(entry.cents),
    share: total === 0 ? 0 : Math.round((entry.cents / total) * 1000) / 10,
  }));
}

/** Los productos activos con más dinero en inventario, de mayor a menor. */
export function topProductsByValue(products: Product[], limit = 5): BarDatum[] {
  const entries = products
    .filter((product) => product.isActive && product.stock > 0)
    .map((product) => ({
      key: product.id,
      label: `${product.code} · ${product.name}`,
      cents: stockValueCents(product),
    }))
    .sort((a, b) => b.cents - a.cents);

  // El porcentaje es sobre todo el inventario, no solo sobre los cinco primeros.
  const total = entries.reduce((sum, entry) => sum + entry.cents, 0);

  return entries.slice(0, limit).map((entry) => ({
    key: entry.key,
    label: entry.label,
    value: fromCents(entry.cents),
    share: total === 0 ? 0 : Math.round((entry.cents / total) * 1000) / 10,
  }));
}

/** Valor del inventario agrupado por categoría, de mayor a menor. */
export function valueByCategory(products: Product[]): BarDatum[] {
  const byCategory = new Map<string, { label: string; cents: number }>();

  for (const product of products) {
    if (!product.isActive) {
      continue;
    }

    const current = byCategory.get(product.categoryId) ?? {
      label: product.categoryName,
      cents: 0,
    };
    current.cents += stockValueCents(product);
    byCategory.set(product.categoryId, current);
  }

  return toBars(
    [...byCategory.entries()]
      .map(([key, entry]) => ({ key, ...entry }))
      .filter((entry) => entry.cents > 0)
      .sort((a, b) => b.cents - a.cents),
  );
}

export interface PendingOrdersSummary {
  count: number;
  totalValue: string;
}

/** Pedidos a proveedor que todavía no se reciben (HU-22, HU-24). */
export function summarizePendingOrders(orders: PurchaseOrderSummary[]): PendingOrdersSummary {
  const pending = orders.filter((order) => order.status === 'PENDING');

  return {
    count: pending.length,
    totalValue: fromCents(pending.reduce((sum, order) => sum + toCents(order.total), 0)),
  };
}
