import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../utils/http-error.js';

type Tx = Prisma.TransactionClient;

/** Un lote que entra: número, vencimiento (nulo si no vence) y unidades. */
export interface IncomingLot {
  lotNumber: string;
  expirationDate: Date | null;
  quantity: number;
}

/** Datos propios de la entrada en el Kardex (motivo, documento, pedido…). */
export type EntryMovementData = Omit<
  Prisma.InventoryMovementUncheckedCreateInput,
  'productId' | 'type' | 'quantity' | 'stockBefore' | 'stockAfter'
>;

/**
 * Entrada de mercadería con lotes (HU-38), la misma para una entrega de pedido
 * y para una compra directa registrada en Movimientos. Dentro de la transacción
 * de quien llama:
 *
 * 1. crea los lotes (`ProductLot`) ANTES de subir el stock, así el disparador
 *    que mantiene «stock = suma de lotes» ya los encuentra y no agrega nada;
 * 2. sube el stock del producto (solo si es del negocio);
 * 3. deja la entrada (ENTRY) en el Kardex y le liga los lotes.
 *
 * Un lote nuevo nunca cambia la fecha de los anteriores, ni la del producto:
 * esa es la del stock sin lote (HU-09); las alertas salen de cada lote (HU-32).
 *
 * @returns El id de la entrada creada en el Kardex.
 */
export async function addStockWithLots(
  tx: Tx,
  businessId: string,
  productId: string,
  lots: IncomingLot[],
  movement: EntryMovementData,
): Promise<string> {
  const quantity = lots.reduce((sum, lot) => sum + lot.quantity, 0);
  const created = await tx.productLot.createManyAndReturn({
    data: lots.map((lot) => ({
      productId,
      lotNumber: lot.lotNumber,
      expirationDate: lot.expirationDate,
      quantity: lot.quantity,
      receivedQuantity: lot.quantity,
    })),
    select: { id: true },
  });
  const updated = await tx.product.updateManyAndReturn({
    where: { id: productId, businessId },
    data: { stock: { increment: quantity } },
    select: { stock: true },
  });
  const product = updated[0];

  if (product === undefined) {
    throw HttpError.notFound('El producto no existe.');
  }

  const entry = await tx.inventoryMovement.create({
    data: {
      ...movement,
      productId,
      type: 'ENTRY',
      quantity,
      stockBefore: product.stock - quantity,
      stockAfter: product.stock,
    },
    select: { id: true },
  });

  await tx.productLot.updateMany({
    where: { id: { in: created.map((lot) => lot.id) } },
    data: { entryMovementId: entry.id },
  });

  return entry.id;
}
