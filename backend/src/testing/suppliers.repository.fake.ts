import type { SuppliersRepository } from '../repositories/suppliers.repository.js';
import type { SupplierDto, SupplierWritableFields } from '../types/suppliers.js';

/**
 * Doble de repositorio de proveedores (HU-21). Guarda los proveedores en
 * memoria y anota lo que el service le pidió escribir.
 */

export const SUPPLIER_A_ID = '44444444-4444-4444-8444-444444444444';
export const MISSING_SUPPLIER_ID = '44444444-9999-4999-8999-999999999999';
export const COFFEE_ID = '55555555-5555-4555-8555-555555555555';
export const RICE_ID = '55555555-6666-4666-8666-666666666666';
export const INACTIVE_PRODUCT_ID = '55555555-7777-4777-8777-777777777777';

const PRODUCT_NAMES: Record<string, { code: string; name: string }> = {
  [COFFEE_ID]: { code: 'P001', name: 'Café molido 500 g' },
  [RICE_ID]: { code: 'P002', name: 'Arroz 1 kg' },
};

/** Proveedor existente: es el principal del café (lo eligió el formulario de productos). */
export function buildSupplier(overrides: Partial<SupplierDto> = {}): SupplierDto {
  return {
    id: SUPPLIER_A_ID,
    name: 'Distribuidora Central',
    contactName: null,
    phone: '2222-3333',
    email: null,
    address: null,
    notes: null,
    isActive: true,
    products: [
      {
        productId: COFFEE_ID,
        productCode: 'P001',
        productName: 'Café molido 500 g',
        unitCost: '1000.00',
        isPreferred: true,
      },
    ],
    ...overrides,
  };
}

export class FakeSuppliersRepository implements SuppliersRepository {
  readonly created: SupplierWritableFields[] = [];
  readonly updated: { id: string; fields: SupplierWritableFields }[] = [];

  private readonly suppliers: SupplierDto[];
  private readonly activeProductIds = new Set([COFFEE_ID, RICE_ID]);

  constructor(suppliers: SupplierDto[] = [buildSupplier()]) {
    this.suppliers = suppliers.map((supplier) => ({ ...supplier }));
  }

  private toDto(id: string, fields: SupplierWritableFields, previous?: SupplierDto): SupplierDto {
    return {
      id,
      ...fields,
      isActive: true,
      products: fields.products.map((product) => ({
        productId: product.productId,
        productCode: PRODUCT_NAMES[product.productId]?.code ?? '?',
        productName: PRODUCT_NAMES[product.productId]?.name ?? '?',
        unitCost: product.unitCost,
        isPreferred:
          previous?.products.find((item) => item.productId === product.productId)?.isPreferred ??
          false,
      })),
    };
  }

  list(): Promise<SupplierDto[]> {
    return Promise.resolve([...this.suppliers]);
  }

  findById(id: string): Promise<SupplierDto | null> {
    return Promise.resolve(this.suppliers.find((supplier) => supplier.id === id) ?? null);
  }

  existsByName(name: string, exceptSupplierId?: string): Promise<boolean> {
    return Promise.resolve(
      this.suppliers.some(
        (supplier) =>
          supplier.name.toLowerCase() === name.toLowerCase() && supplier.id !== exceptSupplierId,
      ),
    );
  }

  findActiveProductIds(productIds: string[]): Promise<string[]> {
    return Promise.resolve(productIds.filter((productId) => this.activeProductIds.has(productId)));
  }

  create(fields: SupplierWritableFields): Promise<SupplierDto> {
    this.created.push(fields);
    const supplier = this.toDto(`new-${this.suppliers.length + 1}`, fields);
    this.suppliers.push(supplier);

    return Promise.resolve(supplier);
  }

  update(id: string, fields: SupplierWritableFields): Promise<SupplierDto> {
    this.updated.push({ id, fields });
    const index = this.suppliers.findIndex((supplier) => supplier.id === id);
    const supplier = this.toDto(id, fields, this.suppliers[index]);
    this.suppliers[index] = supplier;

    return Promise.resolve(supplier);
  }

  readOrFail(id: string): Promise<SupplierDto> {
    const supplier = this.suppliers.find((candidate) => candidate.id === id);

    return supplier === undefined
      ? Promise.reject(new Error(`El doble no tiene el proveedor ${id}.`))
      : Promise.resolve(supplier);
  }
}
