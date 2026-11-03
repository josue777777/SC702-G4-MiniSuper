import { prisma } from '../config/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import type {
  DebtsReportData,
  ReportFilter,
  ReportOptions,
  SalesReportData,
} from '../types/reports.js';

/**
 * Capa de acceso a datos de los reportes comerciales (HU-28, HU-29, HU-30).
 *
 * Solo LEE y está atada a UN negocio (multi-negocio, ADR 0002): cada consulta
 * filtra por `businessId` y nunca recibe un negocio desde la petición. Las
 * consultas corren en una transacción de lectura repetible para que ventas,
 * devoluciones y abonos salgan de la misma foto de la base.
 *
 * Sin miembros privados a propósito: el service se prueba con un doble.
 */
export class ReportsRepository {
  constructor(readonly businessId: string) {}

  /** Categorías del negocio para el filtro del reporte de ventas. */
  async options(): Promise<ReportOptions> {
    const categories = await prisma.category.findMany({
      where: { businessId: this.businessId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true },
    });

    return { categories };
  }

  /**
   * Ventas NO anuladas del período `[start, end)`. Las devueltas parcial o
   * totalmente se incluyen con sus devoluciones para que el service ajuste
   * cantidades; las anuladas nunca son ingreso efectivo y no se leen.
   *
   * Los filtros de categoría y precio se aplican a las LÍNEAS: una venta con
   * varios productos solo trae las líneas que coinciden, y solo si hay alguna.
   */
  async sales(filter: ReportFilter, start: Date, end: Date): Promise<SalesReportData> {
    const lineFilter: Prisma.SaleItemWhereInput = {
      product: {
        businessId: this.businessId,
        ...(filter.categoryId === undefined ? {} : { categoryId: filter.categoryId }),
      },
      ...(filter.minPrice === undefined && filter.maxPrice === undefined
        ? {}
        : {
            unitPrice: {
              ...(filter.minPrice === undefined ? {} : { gte: filter.minPrice }),
              ...(filter.maxPrice === undefined ? {} : { lte: filter.maxPrice }),
            },
          }),
    };

    return prisma.$transaction(
      async (tx) => {
        const business = await tx.business.findUniqueOrThrow({
          where: { id: this.businessId },
          select: { name: true },
        });
        const category =
          filter.categoryId === undefined
            ? null
            : await tx.category.findFirst({
                where: { id: filter.categoryId, businessId: this.businessId },
                select: { name: true },
              });
        const sales = await tx.sale.findMany({
          where: {
            businessId: this.businessId,
            createdAt: { gte: start, lt: end },
            status: { not: 'VOID' },
            items: { some: lineFilter },
          },
          orderBy: [{ createdAt: 'desc' }, { number: 'desc' }],
          select: {
            id: true,
            number: true,
            createdAt: true,
            paymentMethod: true,
            customerId: true,
            total: true,
            creditPayments: {
              where: { customer: { businessId: this.businessId } },
              select: { customerId: true, amount: true },
            },
            items: {
              where: lineFilter,
              orderBy: [{ product: { code: 'asc' } }, { id: 'asc' }],
              select: {
                productId: true,
                quantity: true,
                unitPrice: true,
                unitCost: true,
                product: {
                  select: { code: true, name: true, category: { select: { name: true } } },
                },
                adjustments: { select: { quantity: true } },
              },
            },
          },
        });

        return { businessName: business.name, categoryName: category?.name ?? null, sales };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** Clientes del negocio con sus ventas a crédito y todos sus abonos (activos o no). */
  async debts(): Promise<DebtsReportData> {
    return prisma.$transaction(
      async (tx) => {
        const business = await tx.business.findUniqueOrThrow({
          where: { id: this.businessId },
          select: { name: true },
        });
        const customers = await tx.customer.findMany({
          where: { businessId: this.businessId },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            name: true,
            sales: {
              where: { businessId: this.businessId, paymentMethod: 'CREDIT' },
              orderBy: [{ createdAt: 'asc' }, { number: 'asc' }],
              select: { id: true, number: true, createdAt: true, total: true },
            },
            creditPayments: { select: { amount: true, saleId: true } },
          },
        });

        return { businessName: business.name, customers };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
