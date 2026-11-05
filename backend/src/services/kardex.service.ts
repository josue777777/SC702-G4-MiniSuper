import type { KardexRepository } from '../repositories/kardex.repository.js';
import type {
  KardexMovementDto,
  KardexMovementKind,
  KardexMovementPage,
  KardexMovementRow,
  KardexMovementsQuery,
  KardexProductDto,
  KardexProductOption,
} from '../types/kardex.js';
import { dateToDateOnly } from '../utils/dates.js';
import { HttpError } from '../utils/http-error.js';

/** Productos que ofrece el selector: suficiente para elegir y acota la respuesta. */
const PRODUCT_OPTIONS_LIMIT = 20;

/** Descripción cuando el movimiento no registró un motivo. */
const DEFAULT_CONCEPT: Record<KardexMovementKind, string> = {
  ENTRY: 'Entrada de inventario',
  EXIT: 'Salida de inventario',
  ADJUSTMENT: 'Ajuste de inventario',
};

/**
 * Cuánto entra y cuánto sale en un movimiento.
 *
 * `ENTRY` y `EXIT` guardan la cantidad siempre positiva y el signo lo da el
 * tipo. Un `ADJUSTMENT` puede subir o bajar el stock, así que su sentido sale de
 * lo que realmente cambió (`stockAfter − stockBefore`); un ajuste sin cambio no
 * mueve ni entradas ni salidas.
 *
 * @example
 * movementAmounts({ type: 'ENTRY', quantity: 10, … });                      // { entry: 10, exit: 0 }
 * movementAmounts({ type: 'ADJUSTMENT', stockBefore: 20, stockAfter: 18, … }); // { entry: 0, exit: 2 }
 */
export function movementAmounts(row: KardexMovementRow): { entry: number; exit: number } {
  if (row.type === 'ENTRY') {
    return { entry: row.quantity, exit: 0 };
  }

  if (row.type === 'EXIT') {
    return { entry: 0, exit: row.quantity };
  }

  const change = row.stockAfter - row.stockBefore;

  return { entry: Math.max(change, 0), exit: Math.max(-change, 0) };
}

function toMovementDto(row: KardexMovementRow): KardexMovementDto {
  const reason = row.reason?.trim() ?? '';
  // Hoy las recepciones de pedidos (HU-38) todavía no registran movimientos; cuando lo
  // hagan con `purchaseOrderId`, aparecen aquí sin cambios.
  const reference =
    row.sale !== null
      ? { type: 'SALE' as const, id: row.sale.id, number: row.sale.number }
      : row.purchaseOrder !== null
        ? {
            type: 'PURCHASE_ORDER' as const,
            id: row.purchaseOrder.id,
            number: row.purchaseOrder.number,
          }
        : null;

  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    type: row.type,
    concept: reason === '' ? DEFAULT_CONCEPT[row.type] : reason,
    ...movementAmounts(row),
    stockBefore: row.stockBefore,
    stockAfter: row.stockAfter,
    reference,
  };
}

/**
 * Ficha e historial de un producto (HU-31). Solo consulta: no cambia stock ni
 * registra movimientos. Un producto de otro negocio responde igual que uno que
 * no existe, para no revelar que está en la base.
 */
export class KardexService {
  constructor(private readonly repository: KardexRepository) {}

  searchProducts(term: string | undefined): Promise<KardexProductOption[]> {
    return this.repository.searchProducts(term ?? '', PRODUCT_OPTIONS_LIMIT);
  }

  /** Ficha del producto; también de los desactivados. */
  async getProduct(productId: string): Promise<KardexProductDto> {
    const product = await this.repository.findProduct(productId);

    if (product === null) {
      throw HttpError.notFound('El producto no existe.');
    }

    return {
      id: product.id,
      code: product.code,
      barcode: product.barcode,
      name: product.name,
      categoryName: product.category.name,
      price: product.price.toFixed(2),
      cost: product.cost.toFixed(2),
      supplierName: product.supplierProducts[0]?.supplier.name ?? null,
      stock: product.stock,
      minStock: product.minStock,
      expirationDate:
        product.expirationDate === null ? null : dateToDateOnly(product.expirationDate),
      isActive: product.isActive,
    };
  }

  /** Una página del historial, del más reciente al más antiguo. */
  async listMovements(productId: string, query: KardexMovementsQuery): Promise<KardexMovementPage> {
    if ((await this.repository.findProduct(productId)) === null) {
      throw HttpError.notFound('El producto no existe.');
    }

    const { rows, total } = await this.repository.listMovements(
      productId,
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );

    return {
      items: rows.map(toMovementDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }
}
