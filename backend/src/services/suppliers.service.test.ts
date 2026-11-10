import { describe, expect, it } from 'vitest';
import {
  buildSupplier,
  COFFEE_ID,
  FakeSuppliersRepository,
  INACTIVE_PRODUCT_ID,
  MISSING_SUPPLIER_ID,
  RICE_ID,
  SUPPLIER_A_ID,
} from '../testing/suppliers.repository.fake.js';
import type { SupplierInput } from '../validators/suppliers.validator.js';
import { rankSupplierCosts, SuppliersService } from './suppliers.service.js';

/** Reglas de negocio de proveedores (HU-21), con el doble de repositorio. */

function input(overrides: Partial<SupplierInput> = {}): SupplierInput {
  return {
    name: 'Lácteos del Valle',
    contactName: null,
    phone: '8888-1111',
    email: null,
    address: null,
    notes: null,
    products: [{ productId: RICE_ID, unitCost: '700.00' }],
    ...overrides,
  };
}

function setup() {
  const repository = new FakeSuppliersRepository();

  return { repository, service: new SuppliersService(repository) };
}

describe('SuppliersService.createSupplier', () => {
  it('registra el proveedor con sus productos, que quedan disponibles para pedidos', async () => {
    const { service } = setup();

    const created = await service.createSupplier(input());

    expect(created.products).toEqual([
      expect.objectContaining({ productId: RICE_ID, unitCost: '700.00', isPreferred: false }),
    ]);
    expect((await service.listSuppliers()).map((supplier) => supplier.name)).toContain(
      'Lácteos del Valle',
    );
  });

  it('responde 409 si el nombre ya existe (sin distinguir mayúsculas)', async () => {
    const { repository, service } = setup();

    await expect(
      service.createSupplier(input({ name: 'distribuidora central' })),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.created).toEqual([]);
  });

  it('responde 400 si algún producto no existe o está inactivo', async () => {
    const { repository, service } = setup();

    await expect(
      service.createSupplier(
        input({ products: [{ productId: INACTIVE_PRODUCT_ID, unitCost: '1.00' }] }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.created).toEqual([]);
  });
});

describe('SuppliersService.updateSupplier', () => {
  it('edita los datos y agrega productos, conservando el proveedor principal', async () => {
    const { service } = setup();

    const updated = await service.updateSupplier(
      SUPPLIER_A_ID,
      input({
        name: 'Distribuidora Central S.A.',
        products: [
          { productId: COFFEE_ID, unitCost: '1050.00' },
          { productId: RICE_ID, unitCost: '700.00' },
        ],
      }),
    );

    expect(updated.name).toBe('Distribuidora Central S.A.');
    expect(updated.products).toEqual([
      expect.objectContaining({ productId: COFFEE_ID, unitCost: '1050.00', isPreferred: true }),
      expect.objectContaining({ productId: RICE_ID, isPreferred: false }),
    ]);
  });

  it('no permite quitar un producto del que es el proveedor principal (409)', async () => {
    const { repository, service } = setup();

    await expect(
      service.updateSupplier(SUPPLIER_A_ID, input({ name: 'Distribuidora Central' })),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('Café molido 500 g'),
    });
    expect(repository.updated).toEqual([]);
  });

  it('sí permite quitar un producto que no es principal', async () => {
    const repository = new FakeSuppliersRepository([
      buildSupplier({
        products: [
          {
            productId: RICE_ID,
            productCode: 'P002',
            productName: 'Arroz 1 kg',
            unitCost: '700.00',
            isPreferred: false,
          },
        ],
      }),
    ]);
    const service = new SuppliersService(repository);

    const updated = await service.updateSupplier(
      SUPPLIER_A_ID,
      input({
        name: 'Distribuidora Central',
        products: [{ productId: COFFEE_ID, unitCost: '1.00' }],
      }),
    );

    expect(updated.products.map((product) => product.productId)).toEqual([COFFEE_ID]);
  });

  it('responde 404 si el proveedor no existe y 409 si el nombre lo usa otro', async () => {
    const { service } = setup();
    await service.createSupplier(input({ name: 'Otro Proveedor' }));

    await expect(service.updateSupplier(MISSING_SUPPLIER_ID, input())).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      service.updateSupplier(
        SUPPLIER_A_ID,
        input({ name: 'Otro Proveedor', products: [{ productId: COFFEE_ID, unitCost: '1.00' }] }),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('rankSupplierCosts (HU-39)', () => {
  const row = (supplierName: string, unitCost: string, isPreferred = false) => ({
    supplierId: supplierName,
    supplierName,
    unitCost,
    isPreferred,
    updatedAt: new Date('2026-11-01T12:00:00Z'),
  });

  it('ordena del costo más bajo al más alto y dice cuánto más cuesta cada uno', () => {
    const ranked = rankSupplierCosts([
      row('Comercial del Valle', '4970.00', true),
      row('Distribuidora Central', '4850.00'),
      row('Abarrotes La Unión', '5100.50'),
    ]);

    expect(ranked.map((item) => [item.supplierName, item.difference, item.cheapest])).toEqual([
      ['Distribuidora Central', '0.00', true],
      ['Comercial del Valle', '120.00', false],
      ['Abarrotes La Unión', '250.50', false],
    ]);
    expect(ranked[1]?.isPreferred).toBe(true);
    expect(ranked[0]?.updatedAt).toBe('2026-11-01T12:00:00.000Z');
  });

  it('si dos cuestan lo mismo, los dos son los más baratos y van por nombre', () => {
    expect(
      rankSupplierCosts([row('Zeta', '100.00'), row('Alfa', '100.00')]).map((item) => [
        item.supplierName,
        item.cheapest,
      ]),
    ).toEqual([
      ['Alfa', true],
      ['Zeta', true],
    ]);
  });

  it('sin proveedores, la lista queda vacía', () => {
    expect(rankSupplierCosts([])).toEqual([]);
  });
});
