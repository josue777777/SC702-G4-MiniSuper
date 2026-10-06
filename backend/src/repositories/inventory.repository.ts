import { prisma } from '../config/prisma.js';
import type { CreateInventoryCountPlan, InventoryCountDto } from '../types/inventory.js';

/** Fila de movimiento tal como la devuelve `countSelection`. */
interface CountRow {
  id: string;
  productId: string;
  stockBefore: number;
  stockAfter: number;
  createdAt: Date;
  product: { code: string; name: string };
}

/**
 * Columnas que necesita la pantalla de conteos. Se declara una sola vez para
 * que el registro y el historial devuelvan exactamente la misma forma.
 */
const countSelection = {
  id: true,
  productId: true,
  stockBefore: true,
  stockAfter: true,
  createdAt: true,
  product: { select: { code: true, name: true } },
} as const;

/** Normaliza un movimiento de Prisma a la forma que expone la API. */
function toInventoryCountDto(row: CountRow): InventoryCountDto {
  return {
    id: row.id,
    productId: row.productId,
    productCode: row.product.code,
    productName: row.product.name,
    systemStock: row.stockBefore,
    countedQuantity: row.stockAfter,
    difference: row.stockAfter - row.stockBefore,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Capa de acceso a datos del módulo de inventario (HU-10).
 *
 * Es la ÚNICA capa del flujo que importa Prisma. El service decide qué
 * movimiento corresponde y este repositorio lo persiste, junto con el cambio de
 * stock, en una sola transacción.
 *
 * Sin miembros privados, para poder sustituirlo por un doble en las pruebas.
 */
export class InventoryRepository {
  /** Stock actual de un producto, o `null` si el producto no existe. */
  async findProductStock(productId: string): Promise<{ id: string; stock: number } | null> {
    return prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, stock: true },
    });
  }

  /**
   * Confirma un conteo físico (HU-10): deja el stock en la cantidad contada y
   * guarda el movimiento `ADJUSTMENT` con el antes y el después. Todo en UNA
   * transacción: nunca queda un stock cambiado sin su registro auditable.
   */
  async createCount(plan: CreateInventoryCountPlan): Promise<InventoryCountDto> {
    const row = await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: plan.productId },
        data: { stock: plan.movement.stockAfter },
      });

      return tx.inventoryMovement.create({
        data: { productId: plan.productId, ...plan.movement },
        select: countSelection,
      });
    });

    return toInventoryCountDto(row);
  }

  /**
   * Historial de conteos físicos, del más reciente al más antiguo.
   *
   * Se filtra por el motivo además del tipo porque los ajustes hechos desde la
   * edición de producto (HU-02) también son `ADJUSTMENT` y no son conteos.
   */
  async listCounts(reason: string): Promise<InventoryCountDto[]> {
    const rows = await prisma.inventoryMovement.findMany({
      where: { type: 'ADJUSTMENT', reason },
      select: countSelection,
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(toInventoryCountDto);
  }
}
