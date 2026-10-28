import type { InventoryRepository } from '../repositories/inventory.repository.js';
import type {
  CreateInventoryCountPlan,
  InventoryCountDto,
  ProductStockSettingsDto,
  StockLevel,
} from '../types/inventory.js';
import { TEST_BUSINESS_ID } from './fake-session.js';

/**
 * Doble de repositorio del módulo de inventario (HU-10), compartido por los tests.
 *
 * Igual que el de productos, vive en `src/testing/` (no se compila) y guarda los
 * planes que el service le encarga, que es lo que las pruebas observan.
 */

export const COUNT_PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
export const MISSING_PRODUCT_ID = '11111111-9999-4999-8999-999999999999';

/** Fecha fija para que las respuestas sean predecibles. */
export const COUNT_CREATED_AT = '2026-10-06T15:00:00.000Z';

export interface FakeCountProduct {
  id: string;
  code: string;
  name: string;
  stock: number;
  /** Mínimo de stock (HU-08); si se omite, 0 = sin mínimo. */
  minStock?: number;
  /** Si se omite, el producto está activo. */
  isActive?: boolean;
  /** `YYYY-MM-DD` (HU-09); si se omite, el producto no vence. */
  expirationDate?: string | null;
}

/** Movimiento guardado en el doble, con su motivo para poder filtrar. */
interface StoredMovement {
  reason: string;
  count: InventoryCountDto;
}

export class FakeInventoryRepository implements InventoryRepository {
  readonly businessId = TEST_BUSINESS_ID;

  /** Planes de conteo recibidos, en orden. */
  readonly createdPlans: CreateInventoryCountPlan[] = [];

  readonly products: FakeCountProduct[];
  private readonly movements: StoredMovement[] = [];

  constructor(
    products: FakeCountProduct[] = [
      { id: COUNT_PRODUCT_ID, code: 'P001', name: 'Café molido 500 g', stock: 10 },
    ],
  ) {
    this.products = products.map((product) => ({ ...product }));
  }

  /** Agrega un movimiento ya existente (por ejemplo, un ajuste desde edición de producto). */
  seedMovement(reason: string, count: InventoryCountDto): void {
    this.movements.push({ reason, count });
  }

  findProductStock(productId: string): Promise<{ id: string; stock: number } | null> {
    const product = this.products.find((candidate) => candidate.id === productId);

    return Promise.resolve(product === undefined ? null : { id: product.id, stock: product.stock });
  }

  createCount(plan: CreateInventoryCountPlan): Promise<InventoryCountDto> {
    this.createdPlans.push(plan);

    const product = this.products.find((candidate) => candidate.id === plan.productId);

    if (product === undefined) {
      return Promise.reject(new Error(`El doble no tiene un producto con id ${plan.productId}.`));
    }

    product.stock = plan.movement.stockAfter;

    const count: InventoryCountDto = {
      id: `movement-${this.movements.length + 1}`,
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      systemStock: plan.movement.stockBefore,
      countedQuantity: plan.movement.stockAfter,
      difference: plan.movement.stockAfter - plan.movement.stockBefore,
      createdAt: COUNT_CREATED_AT,
    };

    this.movements.push({ reason: plan.movement.reason, count });

    return Promise.resolve(count);
  }

  listCounts(reason: string): Promise<InventoryCountDto[]> {
    return Promise.resolve(
      this.movements
        .filter((movement) => movement.reason === reason)
        .map((movement) => movement.count)
        .reverse(),
    );
  }

  listStockLevels(): Promise<StockLevel[]> {
    return Promise.resolve(
      this.products
        .filter((product) => product.isActive !== false)
        .map((product) => ({
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          stock: product.stock,
          minStock: product.minStock ?? 0,
        })),
    );
  }

  private toSettings(product: FakeCountProduct): ProductStockSettingsDto {
    return {
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      stock: product.stock,
      minStock: product.minStock ?? 0,
      expirationDate: product.expirationDate ?? null,
    };
  }

  private findOrFail(productId: string): FakeCountProduct {
    const product = this.products.find((candidate) => candidate.id === productId);

    if (product === undefined) {
      throw new Error(`El doble no tiene un producto con id ${productId}.`);
    }

    return product;
  }

  listProductSettings(): Promise<ProductStockSettingsDto[]> {
    return Promise.resolve(
      this.products
        .filter((product) => product.isActive !== false)
        .map((product) => this.toSettings(product)),
    );
  }

  findProductSettings(productId: string): Promise<ProductStockSettingsDto | null> {
    const product = this.products.find((candidate) => candidate.id === productId);

    return Promise.resolve(product === undefined ? null : this.toSettings(product));
  }

  updateMinStock(productId: string, minStock: number): Promise<ProductStockSettingsDto> {
    const product = this.findOrFail(productId);
    product.minStock = minStock;

    return Promise.resolve(this.toSettings(product));
  }

  updateExpirationDate(
    productId: string,
    expirationDate: string | null,
  ): Promise<ProductStockSettingsDto> {
    const product = this.findOrFail(productId);
    product.expirationDate = expirationDate;

    return Promise.resolve(this.toSettings(product));
  }

  updateSettings(
    productId: string,
    data: { minStock?: number; expirationDate?: Date | null },
  ): Promise<ProductStockSettingsDto> {
    const product = this.findOrFail(productId);

    if (data.minStock !== undefined) product.minStock = data.minStock;
    if (data.expirationDate !== undefined) {
      product.expirationDate = data.expirationDate?.toISOString().slice(0, 10) ?? null;
    }

    return Promise.resolve(this.toSettings(product));
  }
}
