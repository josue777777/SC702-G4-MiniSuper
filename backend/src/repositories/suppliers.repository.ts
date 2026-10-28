import { prisma } from '../config/prisma.js';
import type { SupplierDto, SupplierWritableFields } from '../types/suppliers.js';

/** Columnas y relaciones que necesita la pantalla de proveedores. */
const supplierSelection = {
  id: true,
  name: true,
  contactName: true,
  phone: true,
  email: true,
  address: true,
  notes: true,
  isActive: true,
  products: {
    select: {
      productId: true,
      unitCost: true,
      isPreferred: true,
      product: { select: { code: true, name: true } },
    },
    orderBy: { product: { name: 'asc' } },
  },
} as const;

interface SupplierRow {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  products: {
    productId: string;
    unitCost: { toFixed(digits: number): string };
    isPreferred: boolean;
    product: { code: string; name: string };
  }[];
}

function toSupplierDto(row: SupplierRow): SupplierDto {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contactName,
    phone: row.phone,
    email: row.email,
    address: row.address,
    notes: row.notes,
    isActive: row.isActive,
    products: row.products.map((item) => ({
      productId: item.productId,
      productCode: item.product.code,
      productName: item.product.name,
      unitCost: item.unitCost.toFixed(2),
      isPreferred: item.isPreferred,
    })),
  };
}

/** Datos propios del proveedor (sin la lista de productos). */
function supplierData(fields: SupplierWritableFields) {
  return {
    name: fields.name,
    contactName: fields.contactName,
    phone: fields.phone,
    email: fields.email,
    address: fields.address,
    notes: fields.notes,
  };
}

/**
 * Acceso a datos de proveedores (HU-21). Única capa que usa Prisma; sin
 * miembros privados para poder sustituirla por un doble en las pruebas. Atada a
 * UN negocio: proveedores y productos de ese negocio (multi-negocio, ADR 0002).
 */
export class SuppliersRepository {
  constructor(readonly businessId: string) {}

  /** Todos los proveedores con sus productos, ordenados por nombre. */
  async list(): Promise<SupplierDto[]> {
    const rows = await prisma.supplier.findMany({
      where: { businessId: this.businessId },
      select: supplierSelection,
      orderBy: { name: 'asc' },
    });

    return rows.map(toSupplierDto);
  }

  async findById(id: string): Promise<SupplierDto | null> {
    const row = await prisma.supplier.findFirst({
      where: { id, businessId: this.businessId },
      select: supplierSelection,
    });

    return row === null ? null : toSupplierDto(row);
  }

  /** `true` si otro proveedor ya usa ese nombre (sin distinguir mayúsculas). */
  async existsByName(name: string, exceptSupplierId?: string): Promise<boolean> {
    const found = await prisma.supplier.findFirst({
      where: {
        businessId: this.businessId,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptSupplierId === undefined ? {} : { id: { not: exceptSupplierId } }),
      },
      select: { id: true },
    });

    return found !== null;
  }

  /** De los ids recibidos, los que corresponden a productos activos. */
  async findActiveProductIds(productIds: string[]): Promise<string[]> {
    const rows = await prisma.product.findMany({
      // Solo productos de este negocio: un id ajeno no cuenta como válido.
      where: { id: { in: productIds }, businessId: this.businessId, isActive: true },
      select: { id: true },
    });

    return rows.map((row) => row.id);
  }

  /**
   * Registra el proveedor y sus productos en una transacción. Las relaciones
   * nuevas nunca quedan como principales: el proveedor principal de un
   * producto se elige en el formulario de productos (HU-01, HU-02).
   */
  async create(fields: SupplierWritableFields): Promise<SupplierDto> {
    const id = await prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({
        data: { ...supplierData(fields), businessId: this.businessId },
        select: { id: true },
      });

      await tx.supplierProduct.createMany({
        data: fields.products.map((product) => ({
          supplierId: supplier.id,
          productId: product.productId,
          unitCost: product.unitCost,
          isPreferred: false,
        })),
      });

      return supplier.id;
    });

    return this.readOrFail(id);
  }

  /**
   * Guarda la edición en una transacción: datos del proveedor, relaciones
   * quitadas, costos actualizados y relaciones nuevas. `isPreferred` de las
   * relaciones existentes se conserva tal cual.
   */
  async update(id: string, fields: SupplierWritableFields): Promise<SupplierDto> {
    const productIds = fields.products.map((product) => product.productId);

    await prisma.$transaction(async (tx) => {
      const changed = await tx.supplier.updateMany({
        where: { id, businessId: this.businessId },
        data: supplierData(fields),
      });

      if (changed.count === 0) {
        throw new Error(`El proveedor ${id} no es de este negocio.`);
      }

      await tx.supplierProduct.deleteMany({
        where: { supplierId: id, productId: { notIn: productIds } },
      });

      for (const product of fields.products) {
        await tx.supplierProduct.upsert({
          where: { supplierId_productId: { supplierId: id, productId: product.productId } },
          create: {
            supplierId: id,
            productId: product.productId,
            unitCost: product.unitCost,
            isPreferred: false,
          },
          update: { unitCost: product.unitCost },
        });
      }
    });

    return this.readOrFail(id);
  }

  /** Lee un proveedor recién escrito para responder siempre con la misma forma. */
  async readOrFail(id: string): Promise<SupplierDto> {
    const supplier = await this.findById(id);

    if (supplier === null) {
      throw new Error(`El proveedor ${id} no existe.`);
    }

    return supplier;
  }
}
