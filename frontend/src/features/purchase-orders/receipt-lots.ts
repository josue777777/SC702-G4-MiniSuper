import type { PurchaseOrderItem, ReceiptLot } from '../../types/purchase-orders';

/**
 * Lotes de lo que llegó en una entrega (HU-38), tal como se escriben en la
 * ventana «Registrar entrega»: todo es texto porque es lo que dan los
 * controles; `toReceiptLots` lo convierte a lo que acepta la API.
 *
 * Las reglas son las mismas del backend (`resolveReceiptLots`): un producto que
 * vence pide lote y fecha en cada lote; uno que no vence no lleva fecha y, si
 * no se escribe el lote, el lote es el número de factura. Aquí solo se revisan
 * para avisar antes de enviar; quien decide es el servidor.
 */

/** Un lote mientras se escribe. */
export interface LotDraft {
  lotNumber: string;
  /** `YYYY-MM-DD` o vacío. */
  expirationDate: string;
  /** Unidades, como se escribieron. */
  quantity: string;
}

/** Lote vacío con las unidades indicadas (de entrada, todo lo que falta en un solo lote). */
export function emptyLot(quantity: number | string = ''): LotDraft {
  return { lotNumber: '', expirationDate: '', quantity: String(quantity) };
}

/** Unidades escritas → entero ≥ 0, o `null` si no es válido. */
export function parseUnits(text: string): number | null {
  return /^\d{1,7}$/.test(text.trim()) ? Number(text.trim()) : null;
}

/**
 * Cuántas unidades suman los lotes (lo que no es un número cuenta 0).
 *
 * @example lotsTotal([emptyLot(6), emptyLot('4')]); // 10
 */
export function lotsTotal(lots: LotDraft[]): number {
  return lots.reduce((sum, lot) => sum + (parseUnits(lot.quantity) ?? 0), 0);
}

/**
 * Primer problema de los lotes de un producto, o `null` si están bien.
 *
 * @param item Línea del pedido (nombre, lo que falta y si vence).
 * @param lots Lotes escritos; un solo lote = lo que se ve en la fila.
 * @param receivedOn Día en que llegó: un lote no puede llegar vencido.
 * @example
 * lotsError({ productName: 'Leche', pendingQuantity: 10, perishable: true, … },
 *   [{ lotNumber: 'L-1', expirationDate: '', quantity: '10' }], '2026-11-08');
 * // "Indique la fecha de vencimiento del lote L-1 de Leche."
 */
export function lotsError(
  item: Pick<PurchaseOrderItem, 'productName' | 'pendingQuantity' | 'perishable'>,
  lots: LotDraft[],
  receivedOn: string,
): string | null {
  const name = item.productName;

  for (const lot of lots) {
    if (parseUnits(lot.quantity) === null) {
      return `Revise la cantidad de ${name}: debe ser un número entero.`;
    }
  }

  const total = lotsTotal(lots);

  if (total > item.pendingQuantity) {
    return `De ${name} faltan ${item.pendingQuantity}: no puede llegar más.`;
  }

  if (total === 0) {
    return null;
  }

  const seen = new Set<string>();

  for (const lot of lots) {
    const number = lot.lotNumber.trim();

    if (lots.length > 1 && parseUnits(lot.quantity) === 0) {
      return `Cada lote de ${name} debe tener al menos 1 unidad.`;
    }

    if (item.perishable && number === '') {
      return `Indique el número de lote de ${name}.`;
    }

    if (item.perishable && lot.expirationDate === '') {
      return `Indique la fecha de vencimiento del lote ${number} de ${name}.`;
    }

    if (item.perishable && lot.expirationDate < receivedOn) {
      return `El lote ${number} de ${name} ya estaba vencido cuando llegó.`;
    }

    if (number !== '' && seen.has(number.toLowerCase())) {
      return `El lote ${number} de ${name} está repetido.`;
    }

    seen.add(number.toLowerCase());
  }

  return null;
}

/**
 * Lotes para la API. Sin unidades, ninguno; un producto que no vence no manda
 * fecha (y si no se escribió el lote, el servidor pone la factura).
 *
 * @example
 * toReceiptLots({ perishable: false }, [{ lotNumber: '', expirationDate: '', quantity: '6' }]);
 * // [{ lotNumber: '', expirationDate: null, quantity: 6 }]
 */
export function toReceiptLots(
  item: Pick<PurchaseOrderItem, 'perishable'>,
  lots: LotDraft[],
): ReceiptLot[] {
  return lots
    .map((lot) => ({
      lotNumber: lot.lotNumber.trim(),
      expirationDate: item.perishable && lot.expirationDate !== '' ? lot.expirationDate : null,
      quantity: parseUnits(lot.quantity) ?? 0,
    }))
    .filter((lot) => lot.quantity > 0);
}
