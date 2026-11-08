import { prisma } from '../config/prisma.js';
import type {
  KardexAmountRow,
  KardexMovementRow,
  KardexProductOption,
  KardexProductRow,
  KardexRecentMovementRow,
} from '../types/kardex.js';

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
        expirationDate: true,
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
   * Productos para elegir en el selector, por nombre o código sin distinguir
   * mayúsculas. Incluye los desactivados: conservan su historial.
   */
  async searchProducts(term: string, limit: number): Promise<KardexProductOption[]> {
    return prisma.product.findMany({
      where: {
        businessId: this.businessId,
        ...(term === ''
          ? {}
          : {
              OR: [
                { name: { contains: term, mode: 'insensitive' } },
                { code: { contains: term, mode: 'insensitive' } },
              ],
            }),
      },
      orderBy: [{ name: 'asc' }, { code: 'asc' }],
      take: limit,
      select: { id: true, code: true, name: true, isActive: true },
    });
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
  ): Promise<{ rows: KardexMovementRow[]; total: number }> {
    const where = { productId, product: { businessId: this.businessId } };
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
}
