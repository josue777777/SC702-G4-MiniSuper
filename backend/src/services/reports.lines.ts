import type { DecimalLike, SaleReportData } from '../types/reports.js';
import { toCents } from '../utils/money.js';

/** Importe de la base (`Decimal(12, 2)`) en céntimos exactos. */
export function cents(value: DecimalLike): bigint {
  return toCents(value.toFixed(2));
}

/**
 * Línea de una venta ya ajustada por devoluciones. Precio y costo son los
 * HISTÓRICOS guardados en `SaleItem`, nunca los del catálogo actual. Código,
 * nombre y categoría sí son los ACTUALES del producto: el esquema no guarda un
 * snapshot de ellos y este módulo no inventa uno retroactivo.
 */
export interface EffectiveLine {
  saleId: string;
  saleNumber: number;
  soldAt: Date;
  paymentMethod: SaleReportData['paymentMethod'];
  productId: string;
  code: string;
  name: string;
  category: string;
  unitPrice: bigint;
  unitCost: bigint;
  soldUnits: number;
  returnedUnits: number;
  /** Unidades que siguen siendo venta: vendidas − devueltas. */
  netUnits: number;
}

export function toEffectiveLines(sale: SaleReportData): EffectiveLine[] {
  return sale.items.map((item) => {
    const returnedUnits = item.adjustments.reduce(
      (sum, adjustment) => sum + adjustment.quantity,
      0,
    );

    return {
      saleId: sale.id,
      saleNumber: sale.number,
      soldAt: sale.createdAt,
      paymentMethod: sale.paymentMethod,
      productId: item.productId,
      code: item.product.code,
      name: item.product.name,
      category: item.product.category.name,
      unitPrice: cents(item.unitPrice),
      unitCost: cents(item.unitCost),
      soldUnits: item.quantity,
      returnedUnits,
      netUnits: item.quantity - returnedUnits,
    };
  });
}

/** Importes de una línea, en céntimos: lo vendido, lo devuelto, lo que queda y su costo. */
export function lineAmounts(line: EffectiveLine) {
  const net = line.unitPrice * BigInt(line.netUnits);

  return {
    original: line.unitPrice * BigInt(line.soldUnits),
    returned: line.unitPrice * BigInt(line.returnedUnits),
    net,
    cost: line.unitCost * BigInt(line.netUnits),
    profit: net - line.unitCost * BigInt(line.netUnits),
  };
}

/**
 * ¿Se puede contar como COBRADA esta venta para la ganancia (HU-29)?
 *
 * Contado, tarjeta y efectivo se cobran al vender. Un fiado solo cuenta cuando
 * hay abonos LIGADOS A ESA VENTA (y a su cliente) que cubren su total efectivo.
 * No se cuenta cuando:
 *   - no hay abonos ligados (el fiado sigue pendiente);
 *   - el abono es parcial: no se puede saber qué productos cubrió, así que no
 *     se reparte el margen arbitrariamente;
 *   - el abono es general (sin venta): no se atribuye a ninguna venta concreta.
 *
 * ÚNICO PUNTO DE INTEGRACIÓN con HU-19. Hoy no existe el flujo de abonos; cuando
 * HU-19 registre cómo se aplica un abono a las ventas (por ejemplo, con
 * `saleId` o una distribución explícita), solo debe cambiar esta función.
 */
export function isCreditSaleCollected(sale: SaleReportData): boolean {
  if (sale.paymentMethod !== 'CREDIT') {
    return true;
  }

  const paid = sale.creditPayments
    .filter((payment) => payment.customerId === sale.customerId)
    .reduce((sum, payment) => sum + cents(payment.amount), 0n);

  return paid >= cents(sale.total);
}
