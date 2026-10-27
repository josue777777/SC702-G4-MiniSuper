import type { CustomersRepository } from '../repositories/customers.repository.js';
import type { SalesRepository } from '../repositories/sales.repository.js';
import type {
  CreateSalePlan,
  DailySalesSummaryDto,
  SaleDto,
  SaleListFilter,
  SaleProductDto,
  SaleRecord,
  SaleSummaryDto,
} from '../types/sales.js';
import { HttpError } from '../utils/http-error.js';
import { formatCents, toCents } from '../utils/money.js';
import { todayInBusinessZone } from '../utils/dates.js';
import type { CreateSaleInput } from '../validators/sales.validator.js';
import { creditBalance } from './customers.service.js';

export interface CreatedSale {
  sale: SaleDto;
  /** `false` si era un reintento de una venta ya registrada (misma llave). */
  created: boolean;
}

/** Reglas de negocio de la caja: ventas, método de pago y fiado (HU-16, HU-17, HU-18). */
export class SalesService {
  constructor(
    private readonly repository: SalesRepository,
    private readonly customers: CustomersRepository,
  ) {}

  /** Producto vendible a partir del código leído o escrito (HU-16). */
  async lookupProduct(code: string): Promise<SaleProductDto> {
    const product = await this.repository.findProductByCode(code);

    if (product === null) {
      throw HttpError.notFound(
        `No se encontró un producto con el código "${code}". Regístrelo en el catálogo de inventario.`,
      );
    }

    if (!product.isActive) {
      throw HttpError.conflict(`El producto "${product.name}" está desactivado y no se vende.`);
    }

    return product;
  }

  /**
   * Confirma una venta. El precio y el total se calculan AQUÍ con los precios
   * vigentes del catálogo: lo que envíe el navegador no puede cambiarlos.
   */
  async createSale(input: CreateSaleInput): Promise<CreatedSale> {
    // Un mismo producto repetido se suma en una sola línea.
    const quantities = new Map<string, number>();

    for (const line of input.items) {
      quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity);
    }

    const products = await this.repository.findProductsByIds([...quantities.keys()]);
    const byId = new Map(products.map((product) => [product.id, product]));
    const items: CreateSalePlan['items'] = [];
    let totalCents = 0n;

    for (const [productId, quantity] of quantities) {
      const product = byId.get(productId);

      if (product === undefined) {
        throw HttpError.notFound('Uno de los productos de la venta ya no existe.');
      }

      if (!product.isActive) {
        throw HttpError.conflict(`El producto "${product.name}" está desactivado y no se vende.`);
      }

      if (quantity > product.stock) {
        throw HttpError.conflict(
          `Stock insuficiente de "${product.name}": disponible ${product.stock}, pedido ${quantity}.`,
        );
      }

      items.push({ productId, quantity, expectedUnitPrice: product.price });
      totalCents += toCents(product.price) * BigInt(quantity);
    }

    const total = formatCents(totalCents);
    const { customerId, cashReceived } = await this.validatePayment(input, totalCents);

    const outcome = await this.repository.createSale({
      idempotencyKey: input.idempotencyKey,
      paymentMethod: input.paymentMethod,
      customerId,
      cashReceived,
      total,
      items,
    });

    if (!outcome.ok) {
      const name = byId.get(outcome.productId)?.name ?? 'un producto';

      if (outcome.reason === 'PRICE_CHANGED') {
        throw HttpError.conflict(`El precio de "${name}" cambió. Vuelva a agregar el producto.`);
      }

      throw HttpError.conflict(
        outcome.reason === 'UNAVAILABLE'
          ? `El producto "${name}" ya no está disponible para la venta.`
          : `Stock insuficiente de "${name}": otra venta se llevó las unidades.`,
      );
    }

    return { sale: await this.withDerived(outcome.sale), created: outcome.created };
  }

  async getSale(id: string): Promise<SaleDto> {
    const sale = await this.repository.findById(id);

    if (sale === null) {
      throw HttpError.notFound('La venta no existe.');
    }

    return this.withDerived(sale);
  }

  /** Historial mínimo, con filtro por método de pago (HU-17). El módulo completo es HU-20. */
  async listSales(filter: SaleListFilter): Promise<SaleSummaryDto[]> {
    return this.repository.list(filter);
  }

  /** Totales del día calendario del negocio (Costa Rica), sin truncar el historial. */
  async getDailySummary(now: Date = new Date()): Promise<DailySalesSummaryDto> {
    const day = todayInBusinessZone(now);
    // Costa Rica is UTC-6 year-round, so business midnight is 06:00 UTC.
    const startAt = new Date(`${day}T06:00:00.000Z`);
    const endAt = new Date(startAt.getTime() + 24 * 60 * 60 * 1000);

    return this.repository.dailySummary(startAt, endAt);
  }

  /** Reglas del método de pago: efectivo con monto suficiente, tarjeta sin monto, fiado con cliente. */
  private async validatePayment(
    input: CreateSaleInput,
    totalCents: bigint,
  ): Promise<{ customerId: string | null; cashReceived: string | null }> {
    if (input.paymentMethod === 'CASH') {
      if (input.cashReceived === undefined) {
        throw HttpError.badRequest('Indique el monto recibido en efectivo.', {
          cashReceived: ['Indique el monto recibido en efectivo.'],
        });
      }

      if (toCents(input.cashReceived) < totalCents) {
        throw HttpError.badRequest('El monto recibido es menor al total de la venta.', {
          cashReceived: ['El monto recibido es menor al total de la venta.'],
        });
      }
    } else if (input.cashReceived !== undefined) {
      throw HttpError.badRequest('El monto recibido solo aplica a pagos en efectivo.');
    }

    if (input.paymentMethod !== 'CREDIT') {
      if (input.customerId !== undefined) {
        throw HttpError.badRequest('El cliente solo se asocia a ventas a crédito (fiado).');
      }

      return {
        customerId: null,
        cashReceived:
          input.cashReceived === undefined ? null : formatCents(toCents(input.cashReceived)),
      };
    }

    if (input.customerId === undefined) {
      throw HttpError.badRequest('Una venta a crédito necesita un cliente.', {
        customerId: ['Seleccione o cree el cliente al que se le fía.'],
      });
    }

    const customer = await this.customers.findRef(input.customerId);

    if (customer === null) {
      throw HttpError.notFound('El cliente indicado no existe.');
    }

    if (!customer.isActive) {
      throw HttpError.conflict(`El cliente "${customer.name}" está inactivo.`);
    }

    return { customerId: customer.id, cashReceived: null };
  }

  /** Cambio y saldo del fiado: se derivan, no se guardan. */
  private async withDerived(sale: SaleRecord): Promise<SaleDto> {
    const change =
      sale.paymentMethod === 'CASH' && sale.cashReceived !== null
        ? formatCents(toCents(sale.cashReceived) - toCents(sale.total))
        : null;
    const customerBalance =
      sale.paymentMethod === 'CREDIT' && sale.customer !== null
        ? creditBalance(await this.customers.getCreditTotals(sale.customer.id))
        : null;

    return { ...sale, change, customerBalance };
  }
}
