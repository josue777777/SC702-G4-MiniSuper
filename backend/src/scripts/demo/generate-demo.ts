import { PHYSICAL_COUNT_REASON } from '../../services/inventory.service.js';
import { generateInternalEan13, INITIAL_STOCK_REASON } from '../../services/products.service.js';
import {
  CATEGORY_SUPPLIERS,
  DEMO_CATEGORIES,
  DEMO_SUPPLIERS,
  FIRST_NAMES,
  LAST_NAMES,
} from './catalog.js';

/**
 * Genera EN MEMORIA un año de vida de un minisúper de demostración
 * (`npm run db:seed:demo`). No toca la base: devuelve un «plan» con todas las
 * filas, y `write-demo.ts` las guarda. Así la lógica se prueba sin PostgreSQL.
 *
 * La simulación avanza día por día, igual que la aplicación de verdad:
 *   1. a las 06:00 se reciben los pedidos del día anterior (entradas al stock);
 *   2. una vez al mes, a las 06:30, conteo físico de algunos productos (ajustes);
 *   3. durante el día se vende: cada venta descuenta stock y deja su salida;
 *      algunas se devuelven o se anulan, y los fiados se abonan después;
 *   4. al cierre, lo que quedó en su mínimo se pide al proveedor principal.
 *
 * Por eso todo cuadra: el stock final de cada producto es el `stockAfter` de su
 * último movimiento, y cada movimiento parte del saldo del anterior (kardex).
 * Con la misma `seed` sale siempre lo mismo (generador pseudoaleatorio propio).
 */

export interface DemoOptions {
  /** «Hoy»: la última venta no pasa de este momento. */
  now: Date;
  /** Días simulados hacia atrás desde hoy. */
  days: number;
  /** Ventas promedio por día (varía con el día de la semana y el mes). */
  salesPerDay: number;
  /** Tope de productos del catálogo (las pruebas usan pocos). */
  maxProducts: number;
  /** Semilla del generador: misma semilla, mismos datos. */
  seed: number;
}

/** Tamaño «grande»: ~500 productos y ~5 000 ventas de un año. */
export const LARGE_DEMO: Omit<DemoOptions, 'now'> = {
  days: 365,
  salesPerDay: 14,
  maxProducts: 600,
  seed: 20_261_106,
};

export type MovementType = 'ENTRY' | 'EXIT' | 'ADJUSTMENT';
export type PaymentKind = 'CASH' | 'CARD' | 'CREDIT';
export type SaleState = 'COMPLETED' | 'PARTIALLY_RETURNED' | 'RETURNED' | 'VOID';

export interface DemoProduct {
  id: string;
  code: string;
  barcode: string | null;
  name: string;
  categoryId: string;
  /** Importes en céntimos enteros, como `utils/money.ts`. */
  priceCents: number;
  costCents: number;
  stock: number;
  minStock: number;
  expirationDate: Date | null;
  isActive: boolean;
  createdAt: Date;
}

export interface DemoMovement {
  id: string;
  productId: string;
  type: MovementType;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  reason: string;
  saleId: string | null;
  purchaseOrderId: string | null;
  createdAt: Date;
}

export interface DemoSale {
  id: string;
  number: number;
  paymentMethod: PaymentKind;
  status: SaleState;
  /** Total vigente: el original menos lo devuelto (igual que la aplicación). */
  totalCents: number;
  customerId: string | null;
  cashReceivedCents: number | null;
  createdAt: Date;
}

export interface DemoSaleItem {
  id: string;
  saleId: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number;
}

export interface DemoAdjustment {
  id: string;
  saleId: string;
  type: 'RETURN' | 'VOID';
  reason: string;
  totalCents: number;
  createdAt: Date;
  items: { id: string; saleItemId: string; quantity: number }[];
}

export interface DemoPurchaseOrder {
  id: string;
  number: number;
  supplierId: string;
  status: 'PENDING' | 'RECEIVED';
  totalCents: number;
  receivedAt: Date | null;
  createdAt: Date;
  items: {
    id: string;
    productId: string;
    quantity: number;
    unitCostCents: number;
    receivedQuantity: number;
  }[];
}

export interface DemoPlan {
  categories: { id: string; name: string }[];
  products: DemoProduct[];
  suppliers: { id: string; name: string; contactName: string; phone: string; email: string }[];
  supplierProducts: {
    supplierId: string;
    productId: string;
    unitCostCents: number;
    isPreferred: boolean;
  }[];
  customers: { id: string; name: string; phone: string }[];
  sales: DemoSale[];
  saleItems: DemoSaleItem[];
  adjustments: DemoAdjustment[];
  creditPayments: {
    id: string;
    customerId: string;
    saleId: string;
    amountCents: number;
    paymentDate: Date;
  }[];
  purchaseOrders: DemoPurchaseOrder[];
  movements: DemoMovement[];
}

/** Costa Rica está en UTC−6 todo el año: la medianoche local son las 06:00 UTC. */
const CR_OFFSET_HOURS = 6;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Generador pseudoaleatorio «mulberry32»: con la misma semilla da la misma
 * secuencia de números entre 0 y 1. `Math.random()` no deja repetir un resultado.
 *
 * @example const random = seededRandom(1); random(); // siempre 0.6270739…
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Precio en céntimos redondeado a lo que se cobra en una caja: múltiplos de ₡25.
 *
 * @example roundPrice(1234.6) // 122 500 céntimos (₡1 225)
 */
export function roundPrice(colones: number): number {
  return Math.max(25, Math.round(colones / 25) * 25) * 100;
}

/**
 * Efectivo con el que paga el cliente: el billete redondo más cercano hacia
 * arriba (a veces, el monto exacto).
 *
 * @example cashFor(390_000, () => 0.9) // ₡3 900 → paga con ₡5 000 (500 000 céntimos)
 */
export function cashFor(totalCents: number, random: () => number): number {
  if (random() < 0.15) {
    return totalCents;
  }

  for (const bill of [1_000, 2_000, 5_000, 10_000, 20_000]) {
    const cents = bill * 100;

    if (cents >= totalCents) {
      return cents;
    }
  }

  return Math.ceil(totalCents / 2_000_000) * 2_000_000;
}

/** Inicio de un día local (00:00 en Costa Rica), `offset` días antes de `now`. */
function localDayStart(now: Date, daysAgo: number): number {
  const local = new Date(now.getTime() - CR_OFFSET_HOURS * HOUR);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());

  return midnight + CR_OFFSET_HOURS * HOUR - daysAgo * DAY;
}

/**
 * Arma el plan completo del negocio de demostración.
 *
 * @param options Tamaño, fecha de hoy y semilla.
 * @returns Todas las filas a guardar, ya consistentes entre sí.
 */
export function generateDemo(options: DemoOptions): DemoPlan {
  const random = seededRandom(options.seed);
  const uuid = (): string => {
    const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16)).join('');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  };
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
  const between = (min: number, max: number): number =>
    min + Math.floor(random() * (max - min + 1));

  const nowMs = options.now.getTime();
  const start = localDayStart(options.now, options.days);
  const plan: DemoPlan = {
    categories: [],
    products: [],
    suppliers: [],
    supplierProducts: [],
    customers: [],
    sales: [],
    saleItems: [],
    adjustments: [],
    creditPayments: [],
    purchaseOrders: [],
    movements: [],
  };

  // --- Proveedores y clientes ------------------------------------------------
  const supplierIds = DEMO_SUPPLIERS.map(([name, contactName], index) => {
    const id = uuid();
    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^a-z]/g, '');

    plan.suppliers.push({
      id,
      name,
      contactName,
      phone: `2${String(200 + index).padStart(3, '0')}-${String(between(1000, 9999))}`,
      email: `ventas@${slug}.example.com`,
    });

    return id;
  });

  for (let index = 0; index < 40; index += 1) {
    plan.customers.push({
      id: uuid(),
      name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)} ${pick(LAST_NAMES)}`,
      phone: `8${String(between(100, 999))}-${String(between(1000, 9999))}`,
    });
  }

  /**
   * Vencimiento del lote que está en el estante: ~4 % ya vencido, ~8 % por vencer
   * (menos de 15 días) y el resto con tiempo, para que las alertas tengan casos
   * sin llenar la pantalla.
   */
  const expirationFor = (shelfLife: number): Date => {
    const roll = random();
    const days =
      roll < 0.04
        ? between(-10, -1)
        : roll < 0.12
          ? between(0, 14)
          : between(15, Math.max(shelfLife, 60));

    return new Date(localDayStart(options.now, 0) + days * DAY);
  };

  // --- Catálogo ----------------------------------------------------------------
  /** Productos con lo que la simulación necesita llevar día a día. */
  interface Tracked {
    product: DemoProduct;
    weight: number;
    supplierId: string;
    unitCostCents: number;
    target: number;
    pending: boolean;
    sellableUntil: number;
  }
  const tracked: Tracked[] = [];
  let barcodeSeq = 0;

  for (const category of DEMO_CATEGORIES) {
    const categoryId = uuid();
    const [main, alternative] = CATEGORY_SUPPLIERS[category.name] ?? [0, 1];

    plan.categories.push({ id: categoryId, name: category.name });

    let seq = 0;

    for (const [itemName, basePrice] of category.items) {
      for (const [label, factor] of category.presentations) {
        if (plan.products.length >= options.maxProducts) {
          break;
        }

        seq += 1;
        barcodeSeq += 1;

        const priceCents = roundPrice(basePrice * factor);
        // Margen típico de minisúper: el costo es entre 62 % y 80 % del precio.
        const costCents = roundPrice((priceCents / 100) * (0.62 + random() * 0.18));
        const minStock = random() < 0.1 ? 0 : between(4, 15);
        const target = Math.max(minStock * 3, between(20, 60));
        const shelfLife = category.shelfLifeDays;
        const product: DemoProduct = {
          id: uuid(),
          code: `${category.prefix}-${String(seq).padStart(3, '0')}`,
          // 9 de cada 10 tienen código de barras interno válido (EAN-13, sin repetirse).
          barcode:
            random() < 0.9 ? generateInternalEan13(() => 200_000_000_000 + barcodeSeq) : null,
          name: `${itemName} ${label}`,
          categoryId,
          priceCents,
          costCents,
          stock: target,
          minStock,
          // Lo que vence: unos ya vencidos, otros por vencer y la mayoría con tiempo.
          expirationDate: shelfLife === null ? null : expirationFor(shelfLife),
          isActive: true,
          createdAt: new Date(start - DAY),
        };

        plan.products.push(product);
        tracked.push({
          product,
          // Pocos productos se venden mucho (popularidad decreciente).
          weight: 1 / Math.pow(1 + random() * 40, 0.9),
          supplierId: supplierIds[main] ?? supplierIds[0] ?? '',
          unitCostCents: costCents,
          target,
          pending: false,
          sellableUntil: Number.POSITIVE_INFINITY,
        });

        plan.supplierProducts.push({
          supplierId: supplierIds[main] ?? '',
          productId: product.id,
          unitCostCents: costCents,
          isPreferred: true,
        });

        // Casi la mitad también se puede comprar a otro proveedor, con otro costo.
        if (random() < 0.45 && alternative !== main) {
          plan.supplierProducts.push({
            supplierId: supplierIds[alternative] ?? '',
            productId: product.id,
            unitCostCents: roundPrice((costCents / 100) * (0.94 + random() * 0.12)),
            isPreferred: false,
          });
        }

        plan.movements.push({
          id: uuid(),
          productId: product.id,
          type: 'ENTRY',
          quantity: target,
          stockBefore: 0,
          stockAfter: target,
          reason: INITIAL_STOCK_REASON,
          saleId: null,
          purchaseOrderId: null,
          createdAt: new Date(start - DAY + 7 * HOUR),
        });
      }
    }
  }

  // Unos pocos se dejaron de vender hace dos meses (quedan desactivados).
  const retireAt = start + Math.max(0, options.days - 60) * DAY;

  for (const item of tracked.filter(() => random() < 0.02)) {
    item.sellableUntil = retireAt;
    item.product.isActive = false;
  }

  const totalWeight = (alive: Tracked[]) => alive.reduce((sum, item) => sum + item.weight, 0);
  const pickProduct = (alive: Tracked[], weight: number): Tracked | undefined => {
    let target = random() * weight;

    for (const item of alive) {
      target -= item.weight;

      if (target <= 0) {
        return item;
      }
    }

    return alive.at(-1);
  };

  /** Mueve el stock y deja su movimiento (como hacen los repositorios). */
  const move = (
    item: Tracked,
    type: MovementType,
    delta: number,
    at: number,
    reason: string,
    links: { saleId?: string; purchaseOrderId?: string } = {},
  ): void => {
    const before = item.product.stock;
    const after = before + delta;

    item.product.stock = after;
    plan.movements.push({
      id: uuid(),
      productId: item.product.id,
      type,
      quantity: Math.abs(delta),
      stockBefore: before,
      stockAfter: after,
      reason,
      saleId: links.saleId ?? null,
      purchaseOrderId: links.purchaseOrderId ?? null,
      createdAt: new Date(at),
    });
  };

  const byProduct = new Map(tracked.map((item) => [item.product.id, item]));
  /** Pedidos recibidos al día siguiente: día → pedidos. */
  const receipts = new Map<number, DemoPurchaseOrder[]>();
  let saleNumber = 0;
  let orderNumber = 0;

  // --- Un año, día por día -----------------------------------------------------
  for (let day = 0; day < options.days + 1; day += 1) {
    const dayStart = start + day * DAY;

    if (dayStart > nowMs) {
      break;
    }

    // 1. Lo pedido ayer llega a las 06:00 (antes del conteo y de abrir).
    for (const order of receipts.get(day) ?? []) {
      const at = dayStart + 6 * HOUR;

      for (const line of order.items) {
        const item = byProduct.get(line.productId);

        if (item !== undefined && at <= nowMs) {
          move(
            item,
            'ENTRY',
            line.quantity,
            at,
            `Pedido PED-${String(order.number).padStart(4, '0')} recibido`,
            {
              purchaseOrderId: order.id,
            },
          );
          item.pending = false;
        }
      }
    }

    // 2. Conteo físico mensual de 6 productos al azar (06:30, antes de abrir).
    if (day % 30 === 15) {
      const counted = new Set<Tracked>();

      while (counted.size < Math.min(6, tracked.length)) {
        counted.add(pick(tracked));
      }

      for (const item of counted) {
        const difference = Math.max(-item.product.stock, between(-2, 1));

        move(item, 'ADJUSTMENT', difference, dayStart + 6.5 * HOUR, PHYSICAL_COUNT_REASON);
      }
    }

    // 3. Ventas del día, de 07:00 a 21:00, con al menos 3 minutos entre una y otra.
    const date = new Date(dayStart + CR_OFFSET_HOURS * HOUR);
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 1.3 : 1;
    const december = date.getUTCMonth() === 11 ? 1.4 : 1;
    const count = Math.round(options.salesPerDay * weekend * december * (0.7 + random() * 0.6));
    const times = Array.from({ length: count }, () => dayStart + (7 + random() * 14) * HOUR).sort(
      (a, b) => a - b,
    );
    const alive = tracked.filter((item) => dayStart < item.sellableUntil);
    const weight = totalWeight(alive);

    let previous = 0;

    for (const rawTime of times) {
      const at = Math.max(rawTime, previous + 3 * 60_000);

      if (at > nowMs) {
        break;
      }

      previous = at;

      const saleId = uuid();
      const lines: DemoSaleItem[] = [];
      const wanted = 1 + Math.floor(Math.pow(random(), 1.6) * 5);

      for (let line = 0; line < wanted; line += 1) {
        const item = pickProduct(alive, weight);

        if (item === undefined || lines.some((entry) => entry.productId === item.product.id)) {
          continue;
        }

        const quantity = Math.min(item.product.stock, random() < 0.7 ? 1 : between(2, 3));

        if (quantity <= 0) {
          continue;
        }

        lines.push({
          id: uuid(),
          saleId,
          productId: item.product.id,
          quantity,
          unitPriceCents: item.product.priceCents,
          unitCostCents: item.product.costCents,
        });
      }

      if (lines.length === 0) {
        continue;
      }

      saleNumber += 1;

      const totalCents = lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
      const roll = random();
      const method: PaymentKind = roll < 0.6 ? 'CASH' : roll < 0.88 ? 'CARD' : 'CREDIT';
      // Solo la mitad de los clientes compra fiado; los demás son de contado (saldo en 0).
      const customer = method === 'CREDIT' ? pick(plan.customers.slice(0, 20)) : null;
      const sale: DemoSale = {
        id: saleId,
        number: saleNumber,
        paymentMethod: method,
        status: 'COMPLETED',
        totalCents,
        customerId: customer?.id ?? null,
        cashReceivedCents: method === 'CASH' ? cashFor(totalCents, random) : null,
        createdAt: new Date(at),
      };

      plan.sales.push(sale);
      plan.saleItems.push(...lines);

      for (const line of lines) {
        const item = byProduct.get(line.productId);

        if (item !== undefined) {
          move(item, 'EXIT', -line.quantity, at, `Venta #${saleNumber}`, { saleId });
        }
      }

      // Algunas ventas de contado se devuelven o se anulan al minuto.
      const returnRoll = random();

      if (method !== 'CREDIT' && returnRoll < 0.016) {
        const voiding = returnRoll < 0.004;
        const returned = voiding ? lines : [lines[0] as DemoSaleItem];
        const reason = voiding
          ? 'Error al cobrar'
          : pick(['Producto dañado', 'Cliente cambió de opinión', 'Producto vencido']);
        const adjustment: DemoAdjustment = {
          id: uuid(),
          saleId,
          type: voiding ? 'VOID' : 'RETURN',
          reason,
          totalCents: 0,
          createdAt: new Date(at + 60_000),
          items: [],
        };

        for (const line of returned) {
          const quantity = voiding ? line.quantity : 1;
          const item = byProduct.get(line.productId);

          adjustment.items.push({ id: uuid(), saleItemId: line.id, quantity });
          adjustment.totalCents += line.unitPriceCents * quantity;

          if (item !== undefined) {
            move(
              item,
              'ENTRY',
              quantity,
              at + 60_000,
              `${voiding ? 'Anulación' : 'Devolución'} venta #${saleNumber}: ${reason}`,
              { saleId },
            );
          }
        }

        sale.totalCents -= adjustment.totalCents;
        sale.status = voiding
          ? 'VOID'
          : lines.length === 1 && (lines[0]?.quantity ?? 0) === 1
            ? 'RETURNED'
            : 'PARTIALLY_RETURNED';
        plan.adjustments.push(adjustment);
      }

      // Los fiados: la mayoría se pagan completos días después; algunos a medias.
      // Lo de hace más de 45 días casi siempre ya se pagó: las deudas son recientes.
      if (customer !== null) {
        const old = nowMs - at > 45 * DAY;
        const paidRoll = old ? random() * 0.67 : random();
        const paidAt = at + between(1, 25) * DAY + 2 * HOUR;

        if (paidRoll < 0.8 && paidAt <= nowMs) {
          plan.creditPayments.push({
            id: uuid(),
            customerId: customer.id,
            saleId,
            amountCents: paidRoll < 0.65 ? totalCents : Math.round(totalCents / 200) * 100,
            paymentDate: new Date(paidAt),
          });
        }
      }
    }

    // 4. Al cierre (20:30), lo que llegó a su mínimo se pide al proveedor principal.
    const closing = dayStart + 20.5 * HOUR;

    if (closing > nowMs) {
      continue;
    }

    const toOrder = new Map<string, Tracked[]>();

    for (const item of tracked) {
      const reorderPoint = Math.max(item.product.minStock, 3);

      if (!item.pending && dayStart < item.sellableUntil && item.product.stock <= reorderPoint) {
        toOrder.set(item.supplierId, [...(toOrder.get(item.supplierId) ?? []), item]);
      }
    }

    // La última semana los pedidos quedan pendientes (todavía no llegan).
    const lastWeek = day >= options.days - 6;

    for (const [supplierId, items] of toOrder) {
      orderNumber += 1;

      const order: DemoPurchaseOrder = {
        id: uuid(),
        number: orderNumber,
        supplierId,
        status: lastWeek ? 'PENDING' : 'RECEIVED',
        totalCents: 0,
        receivedAt: lastWeek ? null : new Date(dayStart + DAY + 6 * HOUR),
        createdAt: new Date(closing),
        items: items.map((item) => {
          const quantity = item.target - item.product.stock;

          return {
            id: uuid(),
            productId: item.product.id,
            quantity,
            unitCostCents: item.unitCostCents,
            receivedQuantity: lastWeek ? 0 : quantity,
          };
        }),
      };

      order.totalCents = order.items.reduce(
        (sum, line) => sum + line.quantity * line.unitCostCents,
        0,
      );
      plan.purchaseOrders.push(order);

      for (const item of items) {
        item.pending = true;
      }

      if (!lastWeek) {
        receipts.set(day + 1, [...(receipts.get(day + 1) ?? []), order]);
      }
    }
  }

  // Un pedido recibido cuya llegada caería en el futuro todavía no llegó.
  for (const order of plan.purchaseOrders) {
    if (order.receivedAt !== null && order.receivedAt.getTime() > nowMs) {
      order.status = 'PENDING';
      order.receivedAt = null;

      for (const line of order.items) {
        line.receivedQuantity = 0;
      }
    }
  }

  return plan;
}
