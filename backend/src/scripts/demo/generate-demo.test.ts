import { describe, expect, it } from 'vitest';
import { cashFor, generateDemo, roundPrice, seededRandom, type DemoPlan } from './generate-demo.js';

/**
 * Reglas del generador de datos de demostración (`npm run db:seed:demo`): los
 * datos tienen que cuadrar igual que si los hubiera creado la aplicación.
 */

const NOW = new Date('2026-11-05T22:00:00Z'); // 16:00 en Costa Rica
const SMALL = { now: NOW, days: 60, salesPerDay: 10, maxProducts: 80, seed: 7 };

const plan: DemoPlan = generateDemo(SMALL);

/** Dígito de control del EAN-13 (pesos 1 y 3). */
function validEan13(code: string): boolean {
  const sum = [...code.slice(0, 12)].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3),
    0,
  );

  return /^\d{13}$/.test(code) && Number(code[12]) === (10 - (sum % 10)) % 10;
}

describe('generador de datos de demostración', () => {
  it('con la misma semilla da exactamente los mismos datos', () => {
    expect(JSON.stringify(generateDemo(SMALL))).toBe(JSON.stringify(plan));
    expect(seededRandom(1)()).toBe(seededRandom(1)());
  });

  it('el kardex encadena: cada movimiento parte del saldo anterior y el último es el stock', () => {
    for (const product of plan.products) {
      const moves = plan.movements
        .filter((movement) => movement.productId === product.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      let balance = 0;

      for (const movement of moves) {
        expect(movement.stockBefore).toBe(balance);
        expect(movement.quantity).toBe(Math.abs(movement.stockAfter - movement.stockBefore));
        expect(movement.stockAfter).toBeGreaterThanOrEqual(0);
        balance = movement.stockAfter;
      }

      expect(product.stock).toBe(balance);
    }
  });

  it('el total de cada venta es lo vendido menos lo devuelto, y el estado lo refleja', () => {
    for (const sale of plan.sales) {
      const sold = plan.saleItems
        .filter((item) => item.saleId === sale.id)
        .reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
      const returned = plan.adjustments
        .filter((adjustment) => adjustment.saleId === sale.id)
        .reduce((sum, adjustment) => sum + adjustment.totalCents, 0);

      expect(sale.totalCents).toBe(sold - returned);
      expect(sale.status === 'COMPLETED').toBe(returned === 0);
      // Anular deja la venta en 0; devolver todo también (estado «devuelta»).
      if (sale.status === 'VOID') {
        expect(sale.totalCents).toBe(0);
      }

      if (sold > 0 && sale.totalCents === 0) {
        expect(['VOID', 'RETURNED']).toContain(sale.status);
      }
    }
  });

  it('respeta las reglas de la caja: efectivo alcanza, el fiado tiene cliente, el abono no sobra', () => {
    for (const sale of plan.sales) {
      if (sale.paymentMethod === 'CASH') {
        expect(sale.cashReceivedCents ?? 0).toBeGreaterThanOrEqual(sale.totalCents);
      } else {
        expect(sale.cashReceivedCents).toBeNull();
      }

      expect(sale.customerId !== null).toBe(sale.paymentMethod === 'CREDIT');
    }

    for (const payment of plan.creditPayments) {
      const sale = plan.sales.find((entry) => entry.id === payment.saleId);

      expect(sale?.paymentMethod).toBe('CREDIT');
      expect(payment.amountCents).toBeLessThanOrEqual(sale?.totalCents ?? 0);
      expect(payment.paymentDate.getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
  });

  it('los consecutivos van de 1 en 1 y nada pasa después de «hoy»', () => {
    expect(plan.sales.map((sale) => sale.number)).toEqual(plan.sales.map((_, index) => index + 1));
    expect(plan.purchaseOrders.map((order) => order.number)).toEqual(
      plan.purchaseOrders.map((_, index) => index + 1),
    );
    expect(plan.movements.every((movement) => movement.createdAt <= NOW)).toBe(true);
  });

  it('códigos únicos, EAN-13 válidos y un solo proveedor principal por producto', () => {
    expect(new Set(plan.products.map((product) => product.code)).size).toBe(plan.products.length);

    const barcodes = plan.products.flatMap((product) => product.barcode ?? []);

    expect(new Set(barcodes).size).toBe(barcodes.length);
    expect(barcodes.every(validEan13)).toBe(true);

    for (const product of plan.products) {
      const preferred = plan.supplierProducts.filter(
        (link) => link.productId === product.id && link.isPreferred,
      );

      expect(preferred).toHaveLength(1);
    }
  });

  it('un pedido recibido dejó su entrada; uno pendiente todavía no', () => {
    for (const order of plan.purchaseOrders) {
      const entries = plan.movements.filter((movement) => movement.purchaseOrderId === order.id);

      expect(entries.length > 0).toBe(order.status === 'RECEIVED');
    }

    expect(plan.purchaseOrders.some((order) => order.status === 'PENDING')).toBe(true);
  });

  it('precios de caja y billetes redondos', () => {
    expect(roundPrice(1234.6)).toBe(122_500);
    expect(cashFor(390_000, () => 0.9)).toBe(500_000);
    expect(cashFor(390_000, () => 0.1)).toBe(390_000);
  });
});
