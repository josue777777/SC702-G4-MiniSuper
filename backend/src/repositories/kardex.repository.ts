import { prisma } from '../config/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../utils/http-error.js';
import { addStockWithLots, type IncomingLot } from './stock-entries.js';
import type {
  KardexAmountRow,
  KardexDirection,
  KardexStockLotRow,
  KardexMovementRow,
  KardexProductFilter,
  KardexProductOption,
  KardexProductRow,
  KardexRecentMovementRow,
} from '../types/kardex.js';

/**
 * Filtro «Entradas» / «Salidas» del historial: una entrada es un ENTRY o un
 * ajuste que subió el stock; una salida, un EXIT o un ajuste que lo bajó (la
 * misma regla que `movementAmounts`).
 */
function directionFilter(direction: KardexDirection): Prisma.InventoryMovementWhereInput {
  const { stockBefore } = prisma.inventoryMovement.fields;

  if (direction === 'entries') {
    return {
      OR: [{ type: 'ENTRY' }, { type: 'ADJUSTMENT', stockAfter: { gt: stockBefore } }],
    };
  }

  if (direction === 'exits') {
    return { OR: [{ type: 'EXIT' }, { type: 'ADJUSTMENT', stockAfter: { lt: stockBefore } }] };
  }

  return {};
}

/** Columnas de un movimiento en el historial: las mismas en la ficha y en la vista general. */
const movementSelection = {
  id: true,
  type: true,
  quantity: true,
  stockBefore: true,
  stockAfter: true,
  reason: true,
  createdAt: true,
  sale: { select: { id: true, number: true } },
  purchaseOrder: { select: { id: true, number: true } },
  receipt: { select: { invoiceNumber: true } },
  documentNumber: true,
  detail: true,
  exitLot: { select: { lotNumber: true, expirationDate: true } },
  lots: {
    select: { lotNumber: true, expirationDate: true, receivedQuantity: true },
    orderBy: [{ expirationDate: 'asc' as const }, { lotNumber: 'asc' as const }],
  },
};

/**
 * Capa de acceso a datos del Kardex (HU-31). Solo LEE: ninguna operación de
 * esta clase cambia stock ni crea movimientos.
 *
 * Atada a UN negocio (multi-negocio, ADR 0002): el producto debe ser del negocio
 * de la sesión y los movimientos se piden siempre a través de él, así que el id
 * de un producto ajeno se comporta igual que uno que no existe.
 *
 * Sin miembros privados a propósito: el service se prueba con un doble.
 */
export class KardexRepository {
  constructor(readonly businessId: string) {}

  /** Producto del negocio (activo o no) con su categoría y proveedor principal. */
  async findProduct(id: string): Promise<KardexProductRow | null> {
    return prisma.product.findFirst({
      where: { id, businessId: this.businessId },
      select: {
        id: true,
        code: true,
        barcode: true,
        name: true,
        price: true,
        cost: true,
        stock: true,
        minStock: true,
        maxStock: true,
        unit: true,
        description: true,
        perishable: true,
        expirationDate: true,
        // El lote con unidades que vence primero: el vencimiento de la ficha.
        lots: {
          where: { quantity: { gt: 0 }, expirationDate: { not: null } },
          orderBy: { expirationDate: 'asc' },
          take: 1,
          select: { expirationDate: true },
        },
        isActive: true,
        category: { select: { name: true } },
        supplierProducts: {
          where: { isPreferred: true },
          select: { supplier: { select: { name: true } } },
        },
      },
    });
  }

  /**
   * Una página de «Buscar producto»: por nombre o código sin distinguir
   * mayúsculas, o por el código de barras exacto (lector), y por categoría.
   * Incluye los desactivados: conservan su historial.
   */
  async searchProducts(
    filter: KardexProductFilter,
    skip: number,
    take: number,
  ): Promise<{ rows: KardexProductOption[]; total: number }> {
    const { term, categoryId } = filter;
    const where: Prisma.ProductWhereInput = {
      businessId: this.businessId,
      ...(categoryId === undefined ? {} : { categoryId }),
      ...(term === ''
        ? {}
        : {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { code: { contains: term, mode: 'insensitive' } },
              // Con el lector: el código de barras completo.
              { barcode: term },
            ],
          }),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        orderBy: [{ name: 'asc' }, { code: 'asc' }, { id: 'asc' }],
        skip,
        take,
        select: {
          id: true,
          code: true,
          barcode: true,
          name: true,
          isActive: true,
          stock: true,
          category: { select: { name: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    return {
      rows: rows.map(({ category, ...row }) => ({ ...row, categoryName: category.name })),
      total,
    };
  }

  /**
   * Una página de movimientos del producto, del más reciente al más antiguo.
   *
   * Dos movimientos pueden compartir el instante exacto (una venta con varios
   * productos, por ejemplo): `id` desempata para que el orden sea siempre el mismo
   * y una página no repita ni se salte filas. Las filas y el total salen de la
   * misma lectura.
   */
  async listMovements(
    productId: string,
    skip: number,
    take: number,
    direction: KardexDirection = 'all',
  ): Promise<{ rows: KardexMovementRow[]; total: number }> {
    const where = {
      productId,
      product: { businessId: this.businessId },
      ...directionFilter(direction),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.inventoryMovement.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
        select: movementSelection,
      }),
      prisma.inventoryMovement.count({ where }),
    ]);

    return { rows, total };
  }

  /**
   * Vista general: una página de los movimientos de TODOS los productos del
   * negocio, del más reciente al más antiguo (con el mismo desempate por id).
   */
  async listRecentMovements(
    skip: number,
    take: number,
  ): Promise<{ rows: KardexRecentMovementRow[]; total: number }> {
    const where = { product: { businessId: this.businessId } };
    const [rows, total] = await prisma.$transaction([
      prisma.inventoryMovement.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
        select: { ...movementSelection, product: { select: { id: true, code: true, name: true } } },
      }),
      prisma.inventoryMovement.count({ where }),
    ]);

    return { rows, total };
  }

  /** Movimientos del negocio en `[start, end)`, con lo justo para sumar entradas y salidas. */
  async listAmountsBetween(start: Date, end: Date): Promise<KardexAmountRow[]> {
    return prisma.inventoryMovement.findMany({
      where: { product: { businessId: this.businessId }, createdAt: { gte: start, lt: end } },
      select: { type: true, quantity: true, stockBefore: true, stockAfter: true },
    });
  }

  /** Lo justo para sumar entradas y salidas de un producto en `[start, end)`. */
  async listProductAmountsBetween(
    productId: string,
    start: Date,
    end: Date,
  ): Promise<KardexAmountRow[]> {
    return prisma.inventoryMovement.findMany({
      where: {
        productId,
        product: { businessId: this.businessId },
        createdAt: { gte: start, lt: end },
      },
      select: { type: true, quantity: true, stockBefore: true, stockAfter: true },
    });
  }

  /** Lotes del producto que todavía tienen unidades, del que vence primero al último. */
  async listStockLots(productId: string): Promise<KardexStockLotRow[]> {
    return prisma.productLot.findMany({
      where: { productId, quantity: { gt: 0 }, product: { businessId: this.businessId } },
      orderBy: [{ expirationDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      select: { id: true, lotNumber: true, expirationDate: true, quantity: true },
    });
  }

  /** ¿El proveedor es de este negocio y está activo? */
  async supplierIsActive(supplierId: string): Promise<boolean> {
    return (
      (await prisma.supplier.count({
        where: { id: supplierId, businessId: this.businessId, isActive: true },
      })) > 0
    );
  }

  /**
   * Ingreso sin pedido (HU-38): lotes, stock y la entrada del Kardex con la
   * factura, su fecha, el costo y el proveedor, en una sola transacción. El
   * costo queda como el último de ese proveedor para el producto (HU-39).
   */
  async addDirectEntry(
    productId: string,
    lots: IncomingLot[],
    movement: {
      reason: string;
      documentNumber: string;
      documentDate: Date;
      unitCost: string;
      supplierId: string;
    },
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await addStockWithLots(tx, this.businessId, productId, lots, movement);
      // HU-39: el costo de esta compra pasa a ser el último costo registrado de
      // ese proveedor para el producto (la comparación de costos lo usa).
      await tx.supplierProduct.upsert({
        where: { supplierId_productId: { supplierId: movement.supplierId, productId } },
        update: { unitCost: movement.unitCost },
        create: { supplierId: movement.supplierId, productId, unitCost: movement.unitCost },
      });
    });
  }

  /**
   * Egreso (HU-38): baja las unidades del lote elegido y el stock, y deja la
   * salida en el Kardex, en una sola transacción. El lote baja PRIMERO: así,
   * al bajar el stock, el disparador ya encuentra la suma cuadrada y no toca
   * otro lote. Cada paso solo avanza si alcanzan las unidades: si dos personas
   * sacan a la vez, la segunda recibe 409 y nada cambia.
   */
  async registerExit(
    productId: string,
    plan: {
      lotId: string;
      quantity: number;
      reason: string;
      documentNumber: string;
      detail: string | null;
    },
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const lot = await tx.productLot.updateMany({
        where: {
          id: plan.lotId,
          productId,
          product: { businessId: this.businessId },
          quantity: { gte: plan.quantity },
        },
        data: { quantity: { decrement: plan.quantity } },
      });

      if (lot.count === 0) {
        throw HttpError.conflict('El lote ya no tiene esas unidades. Revise lo disponible.');
      }

      const updated = await tx.product.updateManyAndReturn({
        where: { id: productId, businessId: this.businessId, stock: { gte: plan.quantity } },
        data: { stock: { decrement: plan.quantity } },
        select: { stock: true },
      });
      const product = updated[0];

      if (product === undefined) {
        throw HttpError.conflict('No hay stock suficiente para ese egreso.');
      }

      await tx.inventoryMovement.create({
        data: {
          productId,
          type: 'EXIT',
          quantity: plan.quantity,
          stockBefore: product.stock + plan.quantity,
          stockAfter: product.stock,
          reason: plan.reason,
          documentNumber: plan.documentNumber,
          detail: plan.detail,
          exitLotId: plan.lotId,
        },
      });
    });
  }
}
