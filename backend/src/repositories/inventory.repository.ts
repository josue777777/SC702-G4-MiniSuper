import { prisma } from '../config/prisma.js';
import type {
  CreateInventoryCountPlan,
  InventoryCountDto,
  ProductStockSettingsDto,
  StockLevel,
} from '../types/inventory.js';
import { dateOnlyToDate, dateToDateOnly } from '../utils/dates.js';

/** Columnas de la configuración de inventario de un producto (HU-08, HU-09). */
const settingsSelection = {
  id: true,
  code: true,
  name: true,
  stock: true,
  minStock: true,
  expirationDate: true,
} as const;

interface SettingsRow {
  id: string;
  code: string;
  name: string;
  stock: number;
  minStock: number;
  expirationDate: Date | null;
}

function toSettingsDto(row: SettingsRow): ProductStockSettingsDto {
  return {
    productId: row.id,
    productCode: row.code,
    productName: row.name,
    stock: row.stock,
    minStock: row.minStock,
    expirationDate: row.expirationDate === null ? null : dateToDateOnly(row.expirationDate),
  };
}

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
 * Atado a UN negocio: solo ve y cambia productos y movimientos de ese negocio
 * (multi-negocio, ADR 0002).
 *
 * Sin miembros privados, para poder sustituirlo por un doble en las pruebas.
 */
export class InventoryRepository {
  constructor(readonly businessId: string) {}

  /** Stock actual de un producto del negocio, o `null` si no existe en él. */
  async findProductStock(productId: string): Promise<{ id: string; stock: number } | null> {
    return prisma.product.findFirst({
      where: { id: productId, businessId: this.businessId },
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
      const changed = await tx.product.updateMany({
        where: { id: plan.productId, businessId: this.businessId },
        data: { stock: plan.movement.stockAfter },
      });

      if (changed.count === 0) {
        throw new Error(`El producto ${plan.productId} no es de este negocio.`);
      }

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
      where: { type: 'ADJUSTMENT', reason, product: { businessId: this.businessId } },
      select: countSelection,
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(toInventoryCountDto);
  }

  /**
   * Stock y mínimo de los productos activos (HU-08). Un producto desactivado ya
   * no se repone, así que no debe generar alertas. Si el stock está por debajo
   * del mínimo lo decide el service.
   */
  async listStockLevels(): Promise<StockLevel[]> {
    const rows = await prisma.product.findMany({
      where: { businessId: this.businessId, isActive: true },
      select: { id: true, code: true, name: true, stock: true, minStock: true },
      orderBy: { name: 'asc' },
    });

    return rows.map((row) => ({
      productId: row.id,
      productCode: row.code,
      productName: row.name,
      stock: row.stock,
      minStock: row.minStock,
    }));
  }

  /** Mínimo y vencimiento de los productos activos (HU-08, HU-09). */
  async listProductSettings(): Promise<ProductStockSettingsDto[]> {
    const rows = await prisma.product.findMany({
      where: { businessId: this.businessId, isActive: true },
      select: settingsSelection,
      orderBy: { name: 'asc' },
    });

    return rows.map(toSettingsDto);
  }

  /** Configuración de un producto, o `null` si no existe. */
  async findProductSettings(productId: string): Promise<ProductStockSettingsDto | null> {
    const row = await prisma.product.findFirst({
      where: { id: productId, businessId: this.businessId },
      select: settingsSelection,
    });

    return row === null ? null : toSettingsDto(row);
  }

  /** Guarda el mínimo de stock (HU-08). No cambia el stock, así que no genera movimiento. */
  async updateMinStock(productId: string, minStock: number): Promise<ProductStockSettingsDto> {
    return this.updateSettings(productId, { minStock });
  }

  /** Guarda o quita (`null`) la fecha de vencimiento (HU-09). */
  async updateExpirationDate(
    productId: string,
    expirationDate: string | null,
  ): Promise<ProductStockSettingsDto> {
    return this.updateSettings(productId, {
      expirationDate: expirationDate === null ? null : dateOnlyToDate(expirationDate),
    });
  }

  /** Cambia la configuración de un producto SOLO si es de este negocio. */
  async updateSettings(
    productId: string,
    data: { minStock?: number; expirationDate?: Date | null },
  ): Promise<ProductStockSettingsDto> {
    await prisma.product.updateMany({
      where: { id: productId, businessId: this.businessId },
      data,
    });

    const updated = await this.findProductSettings(productId);

    if (updated === null) {
      throw new Error(`El producto ${productId} no es de este negocio.`);
    }

    return updated;
  }
}
