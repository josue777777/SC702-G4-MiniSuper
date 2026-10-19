import { prisma } from '../config/prisma.js';
import type { CreateCustomerFields, CreditTotals, CustomerRef } from '../types/sales.js';

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
}

const customerSelection = { id: true, name: true, phone: true } as const;

const ZERO = '0.00';

type Money = { toFixed(digits: number): string } | null;

function money(value: Money): string {
  return value === null ? ZERO : value.toFixed(2);
}

/**
 * Capa de acceso a datos de los clientes (HU-18). Solo lo imprescindible para
 * fiar: listar activos, crear y consultar los totales del saldo. El saldo NO se
 * guarda; el service lo deriva de estos totales.
 *
 * Sin miembros privados a propósito: el service se prueba con un doble.
 */
export class CustomersRepository {
  /** Clientes activos con sus totales de crédito y abonos. */
  async listActive(): Promise<(CustomerRow & CreditTotals)[]> {
    const customers = await prisma.customer.findMany({
      where: { isActive: true },
      select: customerSelection,
      orderBy: { name: 'asc' },
    });
    const ids = customers.map((customer) => customer.id);
    const [credited, paid] = await Promise.all([
      prisma.sale.groupBy({
        by: ['customerId'],
        where: { customerId: { in: ids }, paymentMethod: 'CREDIT' },
        _sum: { total: true },
      }),
      prisma.creditPayment.groupBy({
        by: ['customerId'],
        where: { customerId: { in: ids } },
        _sum: { amount: true },
      }),
    ]);
    const creditedBy = new Map(credited.map((row) => [row.customerId, money(row._sum.total)]));
    const paidBy = new Map(paid.map((row) => [row.customerId, money(row._sum.amount)]));

    return customers.map((customer) => ({
      ...customer,
      credited: creditedBy.get(customer.id) ?? ZERO,
      paid: paidBy.get(customer.id) ?? ZERO,
    }));
  }

  async create(fields: CreateCustomerFields): Promise<CustomerRow> {
    return prisma.customer.create({ data: fields, select: customerSelection });
  }

  async findRef(id: string): Promise<CustomerRef | null> {
    return prisma.customer.findUnique({
      where: { id },
      select: { id: true, name: true, isActive: true },
    });
  }

  /** Ventas a crédito acumuladas y abonos de un cliente. */
  async getCreditTotals(customerId: string): Promise<CreditTotals> {
    const [credited, paid] = await Promise.all([
      prisma.sale.aggregate({
        where: { customerId, paymentMethod: 'CREDIT' },
        _sum: { total: true },
      }),
      prisma.creditPayment.aggregate({ where: { customerId }, _sum: { amount: true } }),
    ]);

    return { credited: money(credited._sum.total), paid: money(paid._sum.amount) };
  }
}
