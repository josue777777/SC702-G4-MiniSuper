import type { SaleProduct } from '../../types/sales';
import { formatCents, toCents } from './cents';

/** Línea del carrito: el precio mostrado es una referencia; el servidor recalcula. */
export interface CartLine {
  productId: string;
  code: string;
  name: string;
  unitPrice: string;
  /** Stock al momento de escanear: tope de la cantidad. */
  stock: number;
  quantity: number;
}

export interface CartChange {
  cart: CartLine[];
  /** Aviso para el cajero cuando no se pudo agregar o se ajustó la cantidad. */
  warning?: string;
}

/** Agrega una unidad del producto (o suma a la línea existente) sin pasar del stock. */
export function addProduct(cart: CartLine[], product: SaleProduct): CartChange {
  const existing = cart.find((line) => line.productId === product.id);
  const current = existing?.quantity ?? 0;

  if (current + 1 > product.stock) {
    return {
      cart,
      warning:
        product.stock === 0
          ? `"${product.name}" no tiene stock disponible.`
          : `Stock insuficiente de "${product.name}": solo hay ${product.stock}.`,
    };
  }

  if (existing === undefined) {
    return {
      cart: [
        ...cart,
        {
          productId: product.id,
          code: product.code,
          name: product.name,
          unitPrice: product.price,
          stock: product.stock,
          quantity: 1,
        },
      ],
    };
  }

  return {
    cart: cart.map((line) =>
      line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line,
    ),
  };
}

/** Cambia la cantidad de una línea; entre 1 y el stock. Fuera de rango, la ajusta y avisa. */
export function setQuantity(cart: CartLine[], productId: string, quantity: number): CartChange {
  const line = cart.find((candidate) => candidate.productId === productId);

  if (line === undefined || !Number.isInteger(quantity) || quantity < 1) {
    return { cart, warning: 'La cantidad debe ser un número entero de 1 en adelante.' };
  }

  const applied = Math.min(quantity, line.stock);

  return {
    cart: cart.map((candidate) =>
      candidate.productId === productId ? { ...candidate, quantity: applied } : candidate,
    ),
    ...(applied < quantity
      ? { warning: `Stock insuficiente de "${line.name}": solo hay ${line.stock}.` }
      : {}),
  };
}

export function removeLine(cart: CartLine[], productId: string): CartLine[] {
  return cart.filter((line) => line.productId !== productId);
}

export function lineSubtotal(line: CartLine): string {
  return formatCents(toCents(line.unitPrice) * BigInt(line.quantity));
}

export function cartTotal(cart: CartLine[]): string {
  return formatCents(
    cart.reduce((sum, line) => sum + toCents(line.unitPrice) * BigInt(line.quantity), 0n),
  );
}
