import type { PurchaseOrderPayload, PurchaseOrderStatus } from '../../types/purchase-orders';
import type { SupplierProduct } from '../../types/suppliers';

/**
 * Cálculos y validación del formulario de pedido (HU-24), sin React.
 * Es ayuda de experiencia de usuario: el backend vuelve a validar y es quien
 * pone el costo de cada producto.
 */

/** Cantidad escrita por producto (`productId → texto del campo`). Vacío = no se pide. */
export type QuantityInputs = Record<string, string>;

/** Producto del pedido con su cantidad ya interpretada. */
export interface OrderLine {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: string;
  subtotal: string;
}

export const MAX_QUANTITY = 1_000_000;

/** Número del pedido como lo lee una persona: 7 → «PED-0007». */
export function formatOrderNumber(number: number): string {
  return `PED-${String(number).padStart(4, '0')}`;
}

export const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  PENDING: 'Pendiente',
  RECEIVED: 'Recibido',
};

/** Entero entre 1 y el máximo, o `null` si el texto no es una cantidad válida. */
export function parseQuantity(text: string): number | null {
  const trimmed = text.trim();

  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const quantity = Number(trimmed);

  return quantity >= 1 && quantity <= MAX_QUANTITY ? quantity : null;
}

/** El dinero se suma en céntimos para no arrastrar errores de punto flotante. */
function toCents(value: string): number {
  return Math.round(Number(value) * 100);
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Líneas del pedido: solo los productos con una cantidad válida. */
export function buildOrderLines(
  products: SupplierProduct[],
  quantities: QuantityInputs,
): OrderLine[] {
  return products.flatMap((product) => {
    const quantity = parseQuantity(quantities[product.productId] ?? '');

    if (quantity === null) {
      return [];
    }

    return [
      {
        productId: product.productId,
        productName: product.productName,
        quantity,
        unitCost: product.unitCost,
        subtotal: fromCents(toCents(product.unitCost) * quantity),
      },
    ];
  });
}

export function calculateOrderTotal(lines: OrderLine[]): string {
  return fromCents(lines.reduce((sum, line) => sum + toCents(line.subtotal), 0));
}

/** Mensaje de error del formulario, o `null` si se puede enviar. */
export function validateOrder(
  supplierId: string,
  quantities: QuantityInputs,
  lines: OrderLine[],
): string | null {
  if (supplierId === '') {
    return 'Seleccione el proveedor.';
  }

  const invalid = Object.values(quantities).some(
    (text) => text.trim() !== '' && parseQuantity(text) === null,
  );

  if (invalid) {
    return `Las cantidades deben ser números enteros entre 1 y ${MAX_QUANTITY.toLocaleString('es-CR')}.`;
  }

  if (lines.length === 0) {
    return 'Agregue al menos un producto al pedido.';
  }

  return null;
}

export function toOrderPayload(
  supplierId: string,
  notes: string,
  lines: OrderLine[],
): PurchaseOrderPayload {
  const trimmed = notes.trim();

  return {
    supplierId,
    notes: trimmed === '' ? null : trimmed,
    items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
  };
}
