import type { KardexRepository } from '../repositories/kardex.repository.js';
import type {
  KardexAmountRow,
  KardexMovementDto,
  KardexMovementKind,
  KardexMovementPage,
  KardexMovementRow,
  KardexMovementsQuery,
  KardexProductDto,
  KardexProductOption,
  KardexRecentPage,
  KardexStockLotDto,
} from '../types/kardex.js';
import { DIRECT_PURCHASE_CONCEPT, EXIT_CONCEPTS } from '../types/kardex.js';
import {
  businessDayRange,
  dateOnlyToDate,
  dateToDateOnly,
  todayInBusinessZone,
} from '../utils/dates.js';
import type { KardexEntryInput, KardexExitInput } from '../validators/kardex.validator.js';
import { formatOrderNumber, resolveReceiptLots } from './purchase-orders.service.js';
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
export function movementAmounts(row: KardexAmountRow): { entry: number; exit: number } {
  if (row.type === 'ENTRY') {
    return { entry: row.quantity, exit: 0 };
  }

  if (row.type === 'EXIT') {
    return { entry: 0, exit: row.quantity };
  }

  const change = row.stockAfter - row.stockBefore;

  return { entry: Math.max(change, 0), exit: Math.max(-change, 0) };
}

/**
 * Concepto breve del movimiento, para leer el Kardex de un vistazo. El detalle
 * (motivo de la devolución, factura) queda en «Documento» o en la venta.
 *
 * - Entrada de un pedido: «Recepción PED-0408».
 * - Venta: «Venta»; su anulación o devolución: «Anulación de venta» o
 *   «Devolución de cliente».
 * - Lo demás (conteo, ajuste, stock inicial): el motivo tal como se registró.
 *
 * Más adelante se suman «Devolución» a proveedor, «Traslado» y
 * «Vencido-descartado», que hoy ningún módulo registra.
 *
 * @example
 * movementConcept({ type: 'ENTRY', purchaseOrder: { number: 408 }, … }); // "Recepción PED-0408"
 * movementConcept({ type: 'EXIT', sale: { number: 12 }, reason: 'Venta #12', … }); // "Venta"
 */
export function movementConcept(row: KardexMovementRow): string {
  const reason = row.reason?.trim() ?? '';

  if (row.purchaseOrder !== null) {
    return `Recepción ${formatOrderNumber(row.purchaseOrder.number)}`;
  }

  if (row.sale !== null) {
    if (row.type === 'EXIT') {
      return 'Venta';
    }

    return reason.startsWith('Anulación') ? 'Anulación de venta' : 'Devolución de cliente';
  }

  return reason === '' ? DEFAULT_CONCEPT[row.type] : reason;
}

/**
 * Solo el número del documento que originó el movimiento: la factura del
 * proveedor si la hay (es lo que manda el proveedor), si no el pedido, o el
 * número de la venta.
 *
 * @example
 * movementDocument({ receipt: { invoiceNumber: 'na-o1' }, … }); // "na-o1"
 * movementDocument({ documentNumber: '44', … });                // "44"
 * movementDocument({ sale: { number: 408 }, … });               // "408"
 * movementDocument({ reason: 'Conteo físico', … });            // null
 */
export function movementDocument(row: KardexMovementRow): string | null {
  if (row.receipt !== null) {
    return row.receipt.invoiceNumber;
  }

  // Ingreso o egreso registrado en Movimientos: su factura o su documento.
  if (row.documentNumber !== null) {
    return row.documentNumber;
  }

  if (row.purchaseOrder !== null) {
    return formatOrderNumber(row.purchaseOrder.number);
  }

  return row.sale === null ? null : String(row.sale.number);
}

function toMovementDto(row: KardexMovementRow): KardexMovementDto {
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
    concept: movementConcept(row),
    document: movementDocument(row),
    ...movementAmounts(row),
    stockBefore: row.stockBefore,
    stockAfter: row.stockAfter,
    reference,
    // Lo que entró en lotes, o el lote del que salió un egreso.
    lots:
      row.exitLot === null
        ? row.lots.map((lot) => ({
            lotNumber: lot.lotNumber,
            expirationDate: lot.expirationDate === null ? null : dateToDateOnly(lot.expirationDate),
            quantity: lot.receivedQuantity,
          }))
        : [
            {
              lotNumber: row.exitLot.lotNumber,
              expirationDate:
                row.exitLot.expirationDate === null
                  ? null
                  : dateToDateOnly(row.exitLot.expirationDate),
              quantity: row.quantity,
            },
          ],
    detail: row.detail,
  };
}

/**
 * Unidades que entraron y salieron en un grupo de movimientos (el resumen de
 * hoy de la vista general), con la misma regla que cada línea del historial.
 *
 * @example
 * sumAmounts([{ type: 'ENTRY', quantity: 24, … }, { type: 'EXIT', quantity: 13, … }]);
 * // { entries: 24, exits: 13, count: 2 }
 */
export function sumAmounts(rows: KardexAmountRow[]): {
  entries: number;
  exits: number;
  count: number;
} {
  return rows.reduce(
    (total, row) => {
      const { entry, exit } = movementAmounts(row);

      return { entries: total.entries + entry, exits: total.exits + exit, count: total.count + 1 };
    },
    { entries: 0, exits: 0, count: 0 },
  );
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
      maxStock: product.maxStock,
      unit: product.unit,
      description: product.description,
      perishable: product.perishable,
      // El lote que vence primero manda; sin lotes con fecha, la del producto.
      expirationDate: (() => {
        const date = product.lots[0]?.expirationDate ?? product.expirationDate;

        return date === null ? null : dateToDateOnly(date);
      })(),
      isActive: product.isActive,
    };
  }

  /**
   * Una página del historial, del más reciente al más antiguo; con
   * `direction` solo las entradas o solo las salidas. Trae los totales de lo
   * filtrado (fila «Totales») y el resumen de todo el historial (la ficha).
   */
  async listMovements(productId: string, query: KardexMovementsQuery): Promise<KardexMovementPage> {
    if ((await this.repository.findProduct(productId)) === null) {
      throw HttpError.notFound('El producto no existe.');
    }

    const direction = query.direction ?? 'all';
    const [{ rows, total }, filtered, all] = await Promise.all([
      this.repository.listMovements(
        productId,
        (query.page - 1) * query.pageSize,
        query.pageSize,
        direction,
      ),
      this.repository.listProductAmounts(productId, direction),
      direction === 'all' ? null : this.repository.listProductAmounts(productId),
    ]);
    const totals = sumAmounts(filtered);

    return {
      items: rows.map(toMovementDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
      totals,
      summary: all === null ? totals : sumAmounts(all),
    };
  }

  /** Lotes con unidades (para elegir de cuál sale un egreso), del que vence primero. */
  async listStockLots(productId: string): Promise<KardexStockLotDto[]> {
    if ((await this.repository.findProduct(productId)) === null) {
      throw HttpError.notFound('El producto no existe.');
    }

    return (await this.repository.listStockLots(productId)).map((lot) => ({
      id: lot.id,
      lotNumber: lot.lotNumber,
      expirationDate: lot.expirationDate === null ? null : dateToDateOnly(lot.expirationDate),
      quantity: lot.quantity,
    }));
  }

  /**
   * HU-38 — ingreso SIN pedido (compra directa al proveedor) desde
   * Movimientos. Reglas: el proveedor es del negocio y está activo; la
   * factura no es de una fecha futura; los lotes cuadran con lo que entró
   * (`resolveReceiptLots`: si el producto vence, lote y fecha en cada uno).
   * Deja la entrada con concepto «Compra directa», la factura como documento,
   * el costo unitario y el proveedor.
   *
   * @returns La ficha actualizada (con el stock nuevo).
   */
  async registerEntry(
    productId: string,
    input: KardexEntryInput,
    today = todayInBusinessZone(),
  ): Promise<KardexProductDto> {
    const product = await this.getProduct(productId);

    if (!(await this.repository.supplierIsActive(input.supplierId))) {
      throw HttpError.badRequest('El proveedor no existe o está inactivo.', {
        supplierId: ['Elija un proveedor activo.'],
      });
    }

    if (input.documentDate > today) {
      throw HttpError.badRequest('La fecha de la factura no puede ser futura.', {
        documentDate: ['La fecha de la factura no puede ser futura.'],
      });
    }

    const lots = resolveReceiptLots(
      { productName: product.name, perishable: product.perishable },
      { quantity: input.quantity, lots: input.lots },
      input.invoiceNumber,
      input.documentDate,
    );

    await this.repository.addDirectEntry(
      productId,
      lots.map((lot) => ({
        lotNumber: lot.lotNumber,
        expirationDate: lot.expirationDate === null ? null : dateOnlyToDate(lot.expirationDate),
        quantity: lot.quantity,
      })),
      {
        reason: DIRECT_PURCHASE_CONCEPT,
        documentNumber: input.invoiceNumber,
        documentDate: dateOnlyToDate(input.documentDate),
        unitCost: input.unitCost,
        supplierId: input.supplierId,
      },
    );

    return this.getProduct(productId);
  }

  /**
   * HU-38 — egreso: una salida que NO es venta (vencido o descartado,
   * traslado, devolución a proveedor), del lote elegido. Nunca baja de lo que
   * tiene el lote; si alguien sacó antes, responde 409 sin cambiar nada.
   *
   * @returns La ficha actualizada (con el stock nuevo).
   */
  async registerExit(productId: string, input: KardexExitInput): Promise<KardexProductDto> {
    await this.getProduct(productId);

    const lots = await this.repository.listStockLots(productId);
    const lot = lots.find((candidate) => candidate.id === input.lotId);

    if (lot === undefined) {
      throw HttpError.badRequest('Ese lote no es de este producto o ya no tiene unidades.', {
        lotId: ['Elija un lote con unidades.'],
      });
    }

    if (input.quantity > lot.quantity) {
      throw HttpError.badRequest(
        `Del lote ${lot.lotNumber} quedan ${lot.quantity}: no puede salir más.`,
        { quantity: [`Del lote ${lot.lotNumber} quedan ${lot.quantity}.`] },
      );
    }

    await this.repository.registerExit(productId, {
      lotId: lot.id,
      quantity: input.quantity,
      reason: EXIT_CONCEPTS[input.concept],
      documentNumber: input.documentNumber,
      detail: input.detail === undefined || input.detail === '' ? null : input.detail,
    });

    return this.getProduct(productId);
  }

  /**
   * Vista general de Movimientos (sin producto elegido): los últimos
   * movimientos de todos los productos y lo que entró y salió hoy.
   */
  async listRecentMovements(
    query: KardexMovementsQuery,
    today = todayInBusinessZone(),
  ): Promise<KardexRecentPage> {
    const { start, end } = businessDayRange(today, today);
    const [{ rows, total }, todayRows] = await Promise.all([
      this.repository.listRecentMovements((query.page - 1) * query.pageSize, query.pageSize),
      this.repository.listAmountsBetween(start, end),
    ]);

    return {
      items: rows.map((row) => ({ ...toMovementDto(row), product: row.product })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
      today: sumAmounts(todayRows),
    };
  }
}
